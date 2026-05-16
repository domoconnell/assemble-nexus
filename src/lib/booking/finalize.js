import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { booking } from "@/db/schema/entities/booking.js";
import { booking_status_event } from "@/db/schema/entities/booking_status_event.js";
import { customer } from "@/db/schema/entities/customer.js";
import {
	sendBookingDepositPaidEmail,
	sendBookingBalancePaidEmail,
} from "@/utils/email/booking-emails.js";

function outstandingBalanceCents(row) {
	const total = row.total_cents ?? 0;
	const paid = (row.deposit_paid_cents ?? 0) + (row.balance_paid_cents ?? 0);
	return Math.max(0, total - paid);
}

/**
 * Finalise a booking once the deposit has been paid.
 *
 * Idempotent - calling again on an already-confirmed booking is a no-op.
 * Marks `deposit_paid_cents`, flips status `approved → confirmed`, writes a
 * `booking_status_event` row, and best-effort emails the hirer.
 */
export async function finaliseBookingDeposit(bookingId, { paymentRef, amountPaidCents } = {}) {
	const [row] = await db.select().from(booking).where(eq(booking.id, bookingId)).limit(1);
	if (!row) throw new Error(`Booking ${bookingId} not found`);
	if (row.status === "confirmed" || row.status === "completed") return row; // idempotent

	const amount = amountPaidCents ?? row.deposit_required_cents ?? 0;
	const now = new Date();
	const [updated] = await db
		.update(booking)
		.set({
			status: "confirmed",
			confirmed_at: now,
			deposit_paid_cents: amount,
			stripe_deposit_payment_intent_id:
				paymentRef ?? row.stripe_deposit_payment_intent_id ?? null,
		})
		.where(eq(booking.id, row.id))
		.returning();

	await db.insert(booking_status_event).values({
		booking_id: row.id,
		from_status: row.status,
		to_status: "confirmed",
		note: paymentRef ? `Deposit paid (${paymentRef}).` : "Deposit paid.",
	});

	try {
		const [cust] = await db.select().from(customer).where(eq(customer.id, row.customer_id)).limit(1);
		if (cust) {
			await sendBookingDepositPaidEmail({
				booking: updated,
				customer: cust,
				depositPaidCents: amount,
			});
		}
	} catch (err) {
		console.error("[finaliseBookingDeposit] email send failed", err);
	}

	return updated;
}

/**
 * Finalise the hire balance payment for a booking.
 *
 * Adds `amountPaidCents` to `balance_paid_cents`. If the booking is fully
 * paid (deposit + balance >= total), flips status to "completed" and writes
 * a status event. Otherwise leaves status alone (partial-balance scenario -
 * unusual but allowed).
 *
 * Idempotent: a no-op if the booking is already in `completed` or
 * `cancelled` state and there's nothing left to settle.
 */
export async function finaliseBookingBalance(bookingId, { paymentRef, amountPaidCents } = {}) {
	const [row] = await db.select().from(booking).where(eq(booking.id, bookingId)).limit(1);
	if (!row) throw new Error(`Booking ${bookingId} not found`);

	if (row.status === "cancelled" || row.status === "rejected") return row;

	const outstanding = outstandingBalanceCents(row);
	const amount = amountPaidCents ?? outstanding;
	if (amount <= 0) return row;

	const newBalancePaid = (row.balance_paid_cents ?? 0) + amount;
	const fullyPaid = newBalancePaid >= outstanding;
	const now = new Date();

	const setValues = {
		balance_paid_cents: newBalancePaid,
		balance_paid_at: fullyPaid ? now : row.balance_paid_at,
	};
	let nextStatus = row.status;
	if (fullyPaid && row.status === "confirmed") {
		setValues.status = "completed";
		setValues.completed_at = now;
		nextStatus = "completed";
	}

	const [updated] = await db
		.update(booking)
		.set(setValues)
		.where(eq(booking.id, row.id))
		.returning();

	if (nextStatus !== row.status) {
		await db.insert(booking_status_event).values({
			booking_id: row.id,
			from_status: row.status,
			to_status: nextStatus,
			note: paymentRef ? `Balance paid (${paymentRef}).` : "Balance paid.",
		});
	}

	if (fullyPaid) {
		try {
			const [cust] = await db.select().from(customer).where(eq(customer.id, row.customer_id)).limit(1);
			if (cust) {
				await sendBookingBalancePaidEmail({ booking: updated, customer: cust });
			}
		} catch (err) {
			console.error("[finaliseBookingBalance] email send failed", err);
		}
	}

	return updated;
}
