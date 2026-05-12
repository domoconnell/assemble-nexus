/**
 * Stripe driver — stubbed until "Stripe go-live" (final phase).
 *
 * Every method throws a recognisable error so consumers fail loudly if the
 * venue's active PSP is set to "stripe" before the integration lands.
 * Implementing this file is the only required code change for go-live —
 * everything else is already PSP-abstracted.
 */

function notReady() {
	const err = new Error("Stripe driver is not configured. Set the active PSP to 'fake' in Settings → Payments, or complete the Stripe go-live phase.");
	err.code = "psp_not_configured";
	throw err;
}

export const stripePsp = {
	key: "stripe",
	requiresClientSdk: true,
	async createPaymentIntent() { return notReady(); },
	async retrievePaymentIntent() { return notReady(); },
	async confirmPayment() { return notReady(); },
	async createRefund() { return notReady(); },
	async parseWebhook() { return notReady(); },
};
