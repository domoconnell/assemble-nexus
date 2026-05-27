/**
 * Stripe driver - factory-shaped because each venue's credentials live in
 * its own `stripe` setting row (secret key, publishable key, webhook
 * signing secret, environment). Call `createStripeDriver(settings)` to get
 * a driver instance bound to those credentials.
 *
 * Card-payment flow:
 *   1. Server: `createPaymentIntent({ amount_cents, ... })` POSTs to
 *      Stripe, gets back a real PaymentIntent. Caller persists the
 *      psp_intent row + returns the intent to the page.
 *   2. Browser: Payment Element mounts using `client_secret`, user
 *      enters card details inside Stripe's iframe (we never see them),
 *      then calls `stripe.confirmPayment()` client-side.
 *   3. Webhook: `payment_intent.succeeded` lands at /api/webhooks/stripe
 *      and finalises the matching order / booking via the psp_intent
 *      lookup.
 *
 * Server-side `confirmPayment` is intentionally NOT implemented for
 * Stripe live cards (PCI scope). The /api/payments/confirm route
 * rejects Stripe intents and the new payment form skips it.
 */

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { psp_intent } from "@/db/schema/entities/psp_intent.js";

const STRIPE_API = "https://api.stripe.com/v1";

function hashSecret(secret) {
	return createHash("sha256").update(String(secret)).digest("hex");
}

async function stripeFetch(secretKey, path, init = {}) {
	if (!secretKey) return { ok: false, status: 0, error: "Stripe secret key not configured" };
	const headers = {
		Authorization: `Bearer ${secretKey}`,
		Accept: "application/json",
		...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
		...(init.headers ?? {}),
	};
	const res = await fetch(`${STRIPE_API}${path}`, { ...init, headers, cache: "no-store" });
	const json = await res.json().catch(() => null);
	if (!res.ok) {
		return {
			ok: false,
			status: res.status,
			error: json?.error?.message || `Stripe ${res.status}`,
			code: json?.error?.code ?? null,
			decline_code: json?.error?.decline_code ?? null,
		};
	}
	return { ok: true, status: res.status, body: json };
}

function stripeForm(obj, prefix = "") {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(obj)) {
		if (v == null) continue;
		const key = prefix ? `${prefix}[${k}]` : k;
		if (Array.isArray(v)) {
			v.forEach((vv, i) => params.set(`${key}[${i}]`, String(vv)));
		} else if (typeof v === "object") {
			for (const [ik, iv] of stripeForm(v, key).entries()) params.set(ik, iv);
		} else {
			params.set(key, String(v));
		}
	}
	return params;
}

function normaliseIntent(pi, { withSecret = false } = {}) {
	if (!pi) return null;
	return {
		id: pi.id,
		status: mapStatus(pi.status),
		amount_cents: pi.amount ?? 0,
		currency: pi.currency ?? "gbp",
		client_secret: withSecret ? pi.client_secret : "",
		metadata: pi.metadata ?? {},
	};
}

function mapStatus(stripeStatus) {
	switch (stripeStatus) {
		case "succeeded":
		case "requires_capture":
			return "succeeded";
		case "canceled":
			return "canceled";
		case "processing":
		case "requires_action":
		case "requires_confirmation":
			return "requires_action";
		case "requires_payment_method":
		default:
			return "requires_payment_method";
	}
}

export function createStripeDriver(settings) {
	const secretKey = settings?.secret_key || null;

	return {
		key: "stripe",
		requiresClientSdk: true,
		publishableKey: settings?.publishable_key || null,
		environment: settings?.environment || (secretKey?.startsWith("sk_live_") ? "live" : "test"),

		async createPaymentIntent({
			amount_cents,
			currency = "gbp",
			metadata = {},
			description,
			ticket_order_id = null,
			booking_id = null,
		} = {}) {
			if (!secretKey) {
				const err = new Error("Stripe secret key not configured");
				err.code = "psp_not_configured";
				throw err;
			}
			const body = stripeForm({
				amount: Math.round(Number(amount_cents) || 0),
				currency,
				// Card-only - keeps Apple Pay / Google Pay (both work via
				// `card` tokens through the paymentRequest API) while
				// disabling Stripe Link autofill prompts + Klarna /
				// Afterpay tabs that automatic_payment_methods enables.
				payment_method_types: ["card"],
				description: description || null,
				metadata,
			});
			const res = await stripeFetch(secretKey, "/payment_intents", { method: "POST", body });
			if (!res.ok) {
				const err = new Error(res.error || "Stripe rejected the payment intent");
				err.code = res.code || "stripe_error";
				throw err;
			}
			const pi = res.body;
			// Persist a psp_intent row keyed by Stripe's id, so the
			// webhook handler can look up which ticket order / booking
			// to finalise when payment_intent.succeeded fires later.
			// Idempotent: if the same external_id is already saved (e.g.
			// admin retried), we just reuse it.
			await db
				.insert(psp_intent)
				.values({
					provider: "stripe",
					external_id: pi.id,
					status: "requires_payment_method",
					amount_cents: pi.amount ?? 0,
					currency: pi.currency ?? currency,
					metadata,
					ticket_order_id,
					booking_id,
					// We never compare client_secret server-side for Stripe
					// (the browser does), but the column is NOT NULL so we
					// stash a sha256 of it as a non-empty placeholder.
					client_secret_hash: hashSecret(pi.client_secret || pi.id),
				})
				.onConflictDoNothing({
					target: [psp_intent.provider, psp_intent.external_id],
				});
			return normaliseIntent(pi, { withSecret: true });
		},

		async retrievePaymentIntent(intent_id, { withSecret = false } = {}) {
			if (!secretKey) return null;
			if (!intent_id) return null;
			const res = await stripeFetch(secretKey, `/payment_intents/${encodeURIComponent(intent_id)}`);
			if (!res.ok) return null;
			return normaliseIntent(res.body, { withSecret });
		},

		async confirmPayment() {
			const err = new Error(
				"Stripe payments are confirmed client-side via Stripe.js. The /api/payments/confirm route is only for the fake PSP.",
			);
			err.code = "psp_client_confirm_required";
			throw err;
		},

		async createRefund({ intent_id, amount_cents }) {
			if (!secretKey) {
				const err = new Error("Stripe secret key not configured");
				err.code = "psp_not_configured";
				throw err;
			}
			const body = stripeForm({
				payment_intent: intent_id,
				amount: amount_cents != null ? Math.round(Number(amount_cents)) : null,
			});
			const res = await stripeFetch(secretKey, "/refunds", { method: "POST", body });
			if (!res.ok) {
				const err = new Error(res.error || "Stripe refund failed");
				err.code = res.code || "stripe_error";
				throw err;
			}
			return {
				id: res.body.id,
				payment_intent_id: res.body.payment_intent ?? intent_id,
				amount_cents: res.body.amount ?? 0,
				status: res.body.status ?? "succeeded",
			};
		},

		async parseWebhook() {
			// Webhook signature verification + dispatch lives in
			// /api/webhooks/stripe/route.js (it needs raw bytes + the
			// venue-scoped signing secret). This stub stays so the
			// PSP contract is satisfied; it's never called.
			return null;
		},

		async getActualFeeForIntent(intent_id) {
			if (!intent_id) return null;
			if (!secretKey) return null;
			const res = await stripeFetch(
				secretKey,
				`/payment_intents/${encodeURIComponent(intent_id)}?expand[]=latest_charge.balance_transaction`,
			);
			if (!res.ok) {
				console.error("[stripe.getActualFeeForIntent]", intent_id, res.status, res.error);
				return null;
			}
			const txn = res.body?.latest_charge?.balance_transaction;
			if (!txn) return null;
			return typeof txn.fee === "number" ? txn.fee : null;
		},
	};
}

/**
 * Probe the supplied credentials - used by the settings page's "Test
 * connection" button. Lists the first balance entry, which works on any
 * Stripe account and confirms the key has at least read access.
 */
export async function probeStripe(settings) {
	const secretKey = settings?.secret_key || null;
	if (!secretKey) return { ok: false, error: "Paste a secret key first." };
	const res = await stripeFetch(secretKey, "/balance");
	if (!res.ok) {
		return {
			ok: false,
			status: res.status,
			error:
				res.status === 401
					? "Stripe rejected the secret key."
					: res.error,
		};
	}
	const env = secretKey.startsWith("sk_live_") ? "live" : "test";
	return {
		ok: true,
		env,
		currencies: (res.body?.available ?? []).map((b) => b.currency.toUpperCase()).filter(Boolean),
	};
}
