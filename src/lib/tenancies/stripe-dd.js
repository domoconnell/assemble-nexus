import { getStripeSettings } from "@/db/queries/settings.js";

const STRIPE_API = "https://api.stripe.com/v1";

async function stripeRequest(secret, path, { method = "GET", body } = {}) {
	const init = {
		method,
		headers: {
			Authorization: `Bearer ${secret}`,
			Accept: "application/json",
		},
	};
	if (body) {
		init.headers["Content-Type"] = "application/x-www-form-urlencoded";
		init.body = body;
	}
	const res = await fetch(`${STRIPE_API}${path}`, { ...init, cache: "no-store" });
	const json = await res.json().catch(() => null);
	if (!res.ok) {
		throw new Error(json?.error?.message || `Stripe API ${res.status}`);
	}
	return json;
}

function stripeForm(obj, prefix = "") {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(obj)) {
		if (v == null) continue;
		const key = prefix ? `${prefix}[${k}]` : k;
		if (Array.isArray(v)) {
			v.forEach((vv, i) => params.set(`${key}[${i}]`, String(vv)));
		} else if (typeof v === "object") {
			const inner = stripeForm(v, key);
			for (const [ik, iv] of inner.entries()) params.set(ik, iv);
		} else {
			params.set(key, String(v));
		}
	}
	return params;
}

export async function getStripeSecret(venueId) {
	const settings = await getStripeSettings(venueId);
	if (!settings?.secret_key) {
		throw new Error("Stripe is not configured for this venue (Settings → Payments).");
	}
	return settings.secret_key;
}

/**
 * Create a Stripe Checkout Session in `setup` mode for Bacs Direct
 * Debit. Returns the session - the consumer redirects the tenant to
 * `session.url`. After completion Stripe redirects to `success_url` with
 * `?session_id={CHECKOUT_SESSION_ID}` so we can pull the mandate.
 */
export async function createBacsDdSession({
	venueId,
	tenancy,
	tenantEmail,
	successUrl,
	cancelUrl,
}) {
	const secret = await getStripeSecret(venueId);
	const body = stripeForm({
		mode: "setup",
		payment_method_types: ["bacs_debit"],
		customer_email: tenantEmail,
		success_url: successUrl,
		cancel_url: cancelUrl,
		metadata: { tenancy_id: tenancy.id, tenancy_token: tenancy.dd_token },
	});
	return stripeRequest(secret, "/checkout/sessions", { method: "POST", body });
}

/**
 * Retrieve a completed Checkout Session and extract the resulting
 * mandate. Returns `{ customer_id, payment_method_id }` when the setup
 * succeeded, `null` otherwise.
 */
export async function fetchSessionMandate(venueId, sessionId) {
	const secret = await getStripeSecret(venueId);
	const session = await stripeRequest(
		secret,
		`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=setup_intent`,
	);
	if (session.status !== "complete") return null;
	const setupIntentId = session.setup_intent?.id || session.setup_intent;
	if (!setupIntentId) return null;
	const setupIntent =
		typeof session.setup_intent === "object"
			? session.setup_intent
			: await stripeRequest(secret, `/setup_intents/${setupIntentId}`);
	if (setupIntent.status !== "succeeded") return null;
	return {
		customer_id: session.customer || setupIntent.customer || null,
		payment_method_id: setupIntent.payment_method || null,
	};
}

/**
 * Create a Bacs Direct Debit payment intent + auto-confirm it against
 * the saved payment method. Use after a tenancy invoice has been issued
 * to debit the tenant.
 *
 * Returns the created PaymentIntent. Bacs takes a few days to clear so
 * the initial status will be `processing`; webhook updates would move it
 * to `succeeded` later.
 */
export async function chargeMandate({
	venueId,
	customerId,
	paymentMethodId,
	amountCents,
	description,
	metadata = {},
}) {
	const secret = await getStripeSecret(venueId);
	const body = stripeForm({
		amount: amountCents,
		currency: "gbp",
		customer: customerId,
		payment_method: paymentMethodId,
		payment_method_types: ["bacs_debit"],
		off_session: "true",
		confirm: "true",
		description,
		metadata,
	});
	return stripeRequest(secret, "/payment_intents", { method: "POST", body });
}
