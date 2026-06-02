"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/index.js";
import { booking } from "@/db/schema/entities/booking.js";
import { booking_payment } from "@/db/schema/entities/booking_payment.js";
import {
	getBookingPaymentByToken,
} from "@/db/queries/bookings.js";
import { getActivePsp } from "@/lib/psp/index.js";

const Schema = z.object({
	pay_token: z.string().min(8),
});

/**
 * Public — anyone with the token can start paying that specific
 * instalment. Creates a Stripe PaymentIntent for the instalment amount
 * and stamps the resulting `pi_…` id on the booking_payment row so the
 * webhook can mark it paid when the intent succeeds.
 */
export async function startBookingInstalmentPaymentAction(input) {
	const parsed = Schema.parse(input);
	const payment = await getBookingPaymentByToken(parsed.pay_token);
	if (!payment) throw new Error("Payment link not found.");
	if (payment.paid_at) throw new Error("This payment has already been paid.");

	const [b] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, payment.booking_id))
		.limit(1);
	if (!b) throw new Error("Booking not found.");
	if (b.status === "cancelled" || b.status === "rejected") {
		throw new Error(`Booking is ${b.status}; payment can't be taken.`);
	}

	const psp = await getActivePsp(b.venue_id);

	// If we already created an intent for this instalment, reuse it.
	if (payment.stripe_payment_intent_id) {
		let clientSecret = null;
		if (psp.key === "stripe" && psp.retrievePaymentIntent) {
			const intent = await psp.retrievePaymentIntent(
				payment.stripe_payment_intent_id,
				{ withSecret: true },
			);
			clientSecret = intent?.client_secret ?? null;
		}
		return {
			intent_id: payment.stripe_payment_intent_id,
			provider: psp.key,
			client_secret: clientSecret,
			publishable_key: psp.publishableKey ?? null,
		};
	}

	const intent = await psp.createPaymentIntent({
		amount_cents: payment.amount_cents,
		currency: "gbp",
		metadata: {
			booking_id: b.id,
			reference: b.reference,
			kind: "instalment",
			booking_payment_id: payment.id,
			pay_token: payment.pay_token,
		},
		booking_id: b.id,
	});

	await db
		.update(booking_payment)
		.set({ stripe_payment_intent_id: intent.id })
		.where(eq(booking_payment.id, payment.id));

	return {
		intent_id: intent.id,
		provider: psp.key,
		client_secret: intent.client_secret || null,
		publishable_key: psp.publishableKey ?? null,
	};
}
