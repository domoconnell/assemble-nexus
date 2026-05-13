/**
 * Stripe driver — factory-shaped because each venue's credentials live in
 * its own `stripe` setting row (secret key, publishable key, webhook
 * signing secret, environment). Call `createStripeDriver(settings)` to get
 * a driver instance bound to those credentials.
 *
 * Payment-flow methods (createPaymentIntent, confirmPayment, createRefund,
 * parseWebhook) are still stubbed pending the Stripe go-live phase. Only
 * `getActualFeeForIntent` is implemented today — once a venue saves a
 * secret key in Settings → Payments, paid orders begin back-filling
 * `stripe_fee_actual_cents` automatically.
 */

const STRIPE_API = "https://api.stripe.com/v1";

function notReady() {
	const err = new Error(
		"Stripe payment-flow methods are not yet implemented. Set the active PSP to 'fake' in Settings → Payments, or complete the Stripe go-live phase.",
	);
	err.code = "psp_not_configured";
	throw err;
}

async function stripeFetch(secretKey, path) {
	if (!secretKey) return { ok: false, status: 0, error: "Stripe secret key not configured" };
	const res = await fetch(`${STRIPE_API}${path}`, {
		headers: {
			Authorization: `Bearer ${secretKey}`,
			Accept: "application/json",
		},
		cache: "no-store",
	});
	const json = await res.json().catch(() => null);
	if (!res.ok) {
		return { ok: false, status: res.status, error: json?.error?.message || `Stripe ${res.status}` };
	}
	return { ok: true, status: res.status, body: json };
}

export function createStripeDriver(settings) {
	const secretKey = settings?.secret_key || null;

	return {
		key: "stripe",
		requiresClientSdk: true,
		publishableKey: settings?.publishable_key || null,
		environment: settings?.environment || (secretKey?.startsWith("sk_live_") ? "live" : "test"),

		async createPaymentIntent() { return notReady(); },
		async retrievePaymentIntent() { return notReady(); },
		async confirmPayment() { return notReady(); },
		async createRefund() { return notReady(); },
		async parseWebhook() { return notReady(); },

		/**
		 * Retrieve the actual processing fee Stripe charged for a settled
		 * PaymentIntent. Expands the latest charge's balance_transaction in
		 * one call. Returns `fee` (minor units, pence) or null when:
		 *   - secret key isn't saved in settings
		 *   - the intent has no settled charge yet
		 *   - the API call fails (logged, not thrown)
		 */
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
 * Probe the supplied credentials — used by the settings page's "Test
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
