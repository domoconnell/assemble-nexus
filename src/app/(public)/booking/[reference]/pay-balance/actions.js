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
 * Public — anyone with a booking reference can start a balance payment once
 * the deposit has confirmed the booking. Reuses any existing pending balance
 * intent; otherwise creates a fresh one for the outstanding amount.
 */
export async function startBookingBalancePaymentAction(input) {
	const parsed = Schema.parse(input);

	const [row] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, parsed.booking_id))
		.limit(1);
	if (!row) throw new Error("Booking not found");
	if (row.status !== "confirmed") {
		throw new Error(`Balance can only be paid on confirmed bookings.`);
	}
	const total = row.total_cents ?? 0;
	const paid = (row.deposit_paid_cents ?? 0) + (row.balance_paid_cents ?? 0);
	const outstanding = Math.max(0, total - paid);
	if (outstanding <= 0) {
		throw new Error("Nothing outstanding to pay.");
	}

	const existing = await getPendingIntentForBooking(row.id, "balance");
	if (existing) {
		return { intent_id: existing.external_id, provider: existing.provider };
	}

	const psp = await getActivePsp(row.venue_id);
	const intent = await psp.createPaymentIntent({
		amount_cents: outstanding,
		currency: "gbp",
		metadata: { booking_id: row.id, reference: row.reference, kind: "balance" },
		booking_id: row.id,
	});

	revalidatePath(`/booking/${row.reference}/pay-balance`);
	return { intent_id: intent.id, provider: psp.key };
}
