"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/index.js";
import { booking } from "@/db/schema/entities/booking.js";
import { getPendingIntentForBooking } from "@/db/queries/bookings.js";
import { getActivePsp } from "@/lib/psp/index.js";

const Schema = z.object({
	booking_id: z.string().uuid(),
});

/**
 * Public — anyone with a booking reference can start a deposit payment.
 * Reuses any existing pending intent for the booking; otherwise creates a
 * fresh one via the active PSP. Returns the intent + provider for the
 * client-side <PaymentForm>.
 */
export async function startBookingDepositPaymentAction(input) {
	const parsed = Schema.parse(input);

	const [row] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, parsed.booking_id))
		.limit(1);
	if (!row) throw new Error("Booking not found");
	if (row.status !== "approved") {
		throw new Error(`Cannot start payment for a booking with status "${row.status}".`);
	}
	if ((row.deposit_required_cents ?? 0) <= 0) {
		throw new Error("This booking doesn't require a deposit.");
	}

	const existing = await getPendingIntentForBooking(row.id);
	if (existing) {
		return { intent_id: existing.external_id, provider: existing.provider };
	}

	const psp = await getActivePsp(row.venue_id);
	const intent = await psp.createPaymentIntent({
		amount_cents: row.deposit_required_cents,
		currency: "gbp",
		metadata: { booking_id: row.id, reference: row.reference, kind: "deposit" },
		booking_id: row.id,
	});

	revalidatePath(`/booking/${row.reference}/pay`);
	return { intent_id: intent.id, provider: psp.key };
}
