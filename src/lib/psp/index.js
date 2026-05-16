import { fakePsp } from "./fake.js";
import { createStripeDriver } from "./stripe.js";
import { getPaymentsSettings, getStripeSettings } from "@/db/queries/settings.js";

/**
 * Resolve the active PSP driver for a venue. Falls back to FakePSP if no
 * provider has been picked.
 */
export async function getActivePsp(venueId) {
	const settings = await getPaymentsSettings(venueId);
	const key = settings?.provider ?? "fake";
	if (key === "stripe") {
		const stripeSettings = await getStripeSettings(venueId);
		return createStripeDriver(stripeSettings);
	}
	if (key === "fake") return fakePsp;
	throw new Error(`Unknown PSP provider: ${key}`);
}

/**
 * Synchronous lookup used in spots without a venue context (e.g. early
 * payment-form rendering). Stripe instances are unconfigured - call
 * `getActivePsp(venueId)` for the real one. Returns null for unknown keys.
 */
export function getPspByKey(key) {
	if (key === "fake") return fakePsp;
	if (key === "stripe") return createStripeDriver(null);
	return null;
}
