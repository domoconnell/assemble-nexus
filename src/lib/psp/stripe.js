/**
 * Stripe driver — payment-flow methods (createPaymentIntent, confirmPayment,
 * createRefund, parseWebhook) are still stubbed pending the Stripe go-live
 * phase. Read-only metadata helpers (e.g. `getActualFeeForIntent`) ARE
 * implemented now so we can start back-filling fees as soon as a real
 * Stripe key is dropped in. Reads `STRIPE_SECRET_KEY` from env until the
 * payments settings UI grows fields for it.
 */

const STRIPE_API = "https://api.stripe.com/v1";

function notReady() {
	const err = new Error(
		"Stripe driver is not configured. Set the active PSP to 'fake' in Settings → Payments, or complete the Stripe go-live phase.",
	);
	err.code = "psp_not_configured";
	throw err;
}

function stripeSecretKey() {
	return process.env.STRIPE_SECRET_KEY || null;
}

async function stripeFetch(path) {
	const key = stripeSecretKey();
	if (!key) return { ok: false, status: 0, error: "STRIPE_SECRET_KEY not set" };
	const res = await fetch(`${STRIPE_API}${path}`, {
		headers: {
			Authorization: `Bearer ${key}`,
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

export const stripePsp = {
	key: "stripe",
	requiresClientSdk: true,
	async createPaymentIntent() { return notReady(); },
	async retrievePaymentIntent() { return notReady(); },
	async confirmPayment() { return notReady(); },
	async createRefund() { return notReady(); },
	async parseWebhook() { return notReady(); },

	/**
	 * Retrieve the actual processing fee Stripe charged for a settled
	 * PaymentIntent. Expands the latest charge's balance_transaction in
	 * one call, returns `fee` (minor units, pence) or null when:
	 *   - STRIPE_SECRET_KEY isn't set in env
	 *   - the intent has no settled charge yet
	 *   - the API call fails (logged, not thrown)
	 */
	async getActualFeeForIntent(intent_id) {
		if (!intent_id) return null;
		if (!stripeSecretKey()) return null;
		const res = await stripeFetch(
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
