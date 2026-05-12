import { randomUUID, createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { psp_intent } from "@/db/schema/entities/psp_intent.js";

/**
 * FakePSP — collects fake card details and simulates auth/decline so every
 * downstream flow (orders → emails → wallet passes → refunds) works
 * end-to-end without a live Stripe account.
 *
 * Behavioural conventions for testing:
 *  - Any card number ending in "0000" simulates a hard decline.
 *  - Anything else succeeds.
 *  - There are no webhooks: success is synchronous on confirmPayment().
 *
 * Intents are persisted in psp_intent so they survive restarts.
 */

const PROVIDER = "fake";

function hashSecret(secret) {
	return createHash("sha256").update(secret).digest("hex");
}

function normaliseCardNumber(n) {
	return String(n ?? "").replace(/\s+/g, "");
}

function rowToIntent(row) {
	return {
		id: row.external_id,
		status: row.status,
		amount_cents: row.amount_cents,
		currency: row.currency,
		client_secret: row._client_secret,
		metadata: row.metadata ?? {},
	};
}

export const fakePsp = {
	key: PROVIDER,
	requiresClientSdk: false,

	async createPaymentIntent({
		amount_cents,
		currency = "gbp",
		metadata = {},
		ticket_order_id = null,
		booking_id = null,
	}) {
		const external_id = `fpi_${randomUUID()}`;
		const client_secret = `${external_id}_secret_${randomUUID().slice(0, 12)}`;
		const [row] = await db
			.insert(psp_intent)
			.values({
				provider: PROVIDER,
				external_id,
				status: "requires_payment_method",
				amount_cents,
				currency,
				metadata,
				ticket_order_id,
				booking_id,
				client_secret_hash: hashSecret(client_secret),
			})
			.returning();
		return rowToIntent({ ...row, _client_secret: client_secret });
	},

	async retrievePaymentIntent(external_id) {
		const [row] = await db
			.select()
			.from(psp_intent)
			.where(and(eq(psp_intent.provider, PROVIDER), eq(psp_intent.external_id, external_id)))
			.limit(1);
		if (!row) return null;
		// Client secret is one-time-presentation-only; never re-emit.
		return {
			id: row.external_id,
			status: row.status,
			amount_cents: row.amount_cents,
			currency: row.currency,
			client_secret: "",
			metadata: row.metadata ?? {},
		};
	},

	async confirmPayment({ intent_id, payment_method_details }) {
		const card = payment_method_details?.card;
		if (!card) throw new Error("Card details required.");
		const number = normaliseCardNumber(card.number);
		if (number.length < 12) throw new Error("Invalid card number.");
		if (!card.exp_month || !card.exp_year) throw new Error("Card expiry required.");
		if (!card.cvc || String(card.cvc).length < 3) throw new Error("CVC required.");

		const [row] = await db
			.select()
			.from(psp_intent)
			.where(and(eq(psp_intent.provider, PROVIDER), eq(psp_intent.external_id, intent_id)))
			.limit(1);
		if (!row) throw new Error("Unknown payment intent.");
		if (row.status === "succeeded") return rowToIntent({ ...row, _client_secret: "" });
		if (row.status === "failed" || row.status === "canceled") {
			throw new Error("This payment is no longer payable.");
		}

		const declined = number.endsWith("0000");
		const next_status = declined ? "failed" : "succeeded";

		const [updated] = await db
			.update(psp_intent)
			.set({ status: next_status })
			.where(eq(psp_intent.id, row.id))
			.returning();

		const intent = rowToIntent({ ...updated, _client_secret: "" });
		if (declined) {
			const err = new Error("Your card was declined.");
			err.code = "card_declined";
			err.intent = intent;
			throw err;
		}
		return intent;
	},

	async createRefund({ intent_id, amount_cents }) {
		const [row] = await db
			.select()
			.from(psp_intent)
			.where(and(eq(psp_intent.provider, PROVIDER), eq(psp_intent.external_id, intent_id)))
			.limit(1);
		if (!row) throw new Error("Unknown payment intent.");
		if (row.status !== "succeeded") throw new Error("Only succeeded payments can be refunded.");
		if (amount_cents <= 0 || amount_cents > row.amount_cents) {
			throw new Error("Refund amount must be between 0 and the original payment.");
		}
		return {
			id: `frf_${randomUUID()}`,
			payment_intent_id: intent_id,
			amount_cents,
			status: "succeeded",
		};
	},

	async parseWebhook() {
		throw new Error("FakePSP has no webhooks — success is synchronous on confirmPayment.");
	},
};
