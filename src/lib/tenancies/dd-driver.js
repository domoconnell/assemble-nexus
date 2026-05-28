import { getPaymentsSettings } from "@/db/queries/settings.js";
import * as stripeDd from "./stripe-dd.js";
import * as fakeDd from "./fake-dd.js";

/**
 * Direct Debit driver dispatcher. The mandate is owned by the
 * organisation (one mandate covers any number of tenancies / one-off
 * charges for that org).
 *
 *   createBacsDdSession({ organisation, tenantEmail, successUrl, cancelUrl, origin })
 *     -> { id, url }   (redirect the tenant to `url`)
 *
 *   fetchSessionMandate(sessionId)
 *     -> { customer_id, payment_method_id } | null
 *
 *   chargeMandate({ customerId, paymentMethodId, amountCents, description, metadata })
 *     -> PSP-shaped payment intent
 *
 * The Stripe driver hits the real Stripe API; the Fake driver renders a
 * sandbox form at /tenancy/[token]/direct-debit/sandbox and persists
 * synthetic mandate IDs that round-trip through the rest of the system
 * exactly like real ones.
 */

export async function getActiveDdDriver(venueId) {
	const settings = await getPaymentsSettings(venueId);
	const key = settings?.provider ?? "fake";
	if (key === "stripe") return stripeDriver(venueId);
	if (key === "fake") return fakeDriver();
	throw new Error(`Unknown PSP provider for DD: ${key}`);
}

function stripeDriver(venueId) {
	return {
		key: "stripe",
		async createBacsDdSession({ organisation, tenantEmail, successUrl, cancelUrl }) {
			const session = await stripeDd.createBacsDdSession({
				venueId,
				organisation,
				tenantEmail,
				successUrl,
				cancelUrl,
			});
			return { id: session.id, url: session.url };
		},
		async fetchSessionMandate(sessionId) {
			return stripeDd.fetchSessionMandate(venueId, sessionId);
		},
		async chargeMandate(args) {
			return stripeDd.chargeMandate({ venueId, ...args });
		},
	};
}

function fakeDriver() {
	return {
		key: "fake",
		async createBacsDdSession({ organisation, successUrl, cancelUrl, origin }) {
			return fakeDd.createBacsDdSession({
				organisation,
				successUrl,
				cancelUrl,
				origin,
			});
		},
		async fetchSessionMandate(sessionId) {
			return fakeDd.fetchSessionMandate(sessionId);
		},
		async chargeMandate(args) {
			return fakeDd.chargeMandate(args);
		},
	};
}
