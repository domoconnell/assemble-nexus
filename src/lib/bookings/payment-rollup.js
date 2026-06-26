import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { booking } from "@/db/schema/entities/booking.js";
import { listBookingPayments } from "@/db/queries/bookings.js";

/**
 * Sum every paid instalment on a booking and roll it into the legacy
 * `deposit_paid_cents` field so existing widgets / CRM totals keep
 * working. `balance_paid_cents` stays at zero — once we're on
 * instalments the deposit/balance split is just a roll-up. Also flips
 * the booking to `confirmed` once the first instalment lands and
 * `completed` once everything is paid.
 *
 * Lives in `lib/bookings/` (not in the admin actions module) so the
 * banking auto-matcher can invoke it after stamping a booking_payment
 * as paid via bank match — same side-effects as a human pressing
 * "Mark paid (offline)".
 */
export async function rollUpBookingPaidAmounts(bookingId) {
	const payments = await listBookingPayments(bookingId);
	const paidSum = payments
		.filter((p) => p.paid_at)
		.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
	const [b] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, bookingId))
		.limit(1);
	if (!b) return;
	const patch = {
		deposit_paid_cents: paidSum,
		balance_paid_cents: 0,
	};
	const total = b.total_cents ?? 0;
	const now = new Date();
	if (paidSum > 0 && b.status === "approved") {
		patch.status = "confirmed";
		patch.confirmed_at = now;
	}
	if (paidSum >= total && total > 0 && b.status !== "completed") {
		patch.status = "completed";
		patch.completed_at = now;
		patch.balance_paid_at = now;
	}
	await db.update(booking).set(patch).where(eq(booking.id, bookingId));
}
