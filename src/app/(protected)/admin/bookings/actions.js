"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/index.js";
import { booking } from "@/db/schema/entities/booking.js";
import { booking_status_event } from "@/db/schema/entities/booking_status_event.js";
import { customer } from "@/db/schema/entities/customer.js";
import { event } from "@/db/schema/entities/event.js";
import {
	findConflictingSegments,
	findConflictingEvents,
	listBookingSegments,
	listBookingPayments,
	insertBookingPayments,
	updateBookingPayment,
	softDeleteBookingPayment,
	getBookingById,
} from "@/db/queries/bookings.js";
import { booking_payment } from "@/db/schema/entities/booking_payment.js";
import { randomBytes } from "node:crypto";
import { room } from "@/db/schema/entities/room.js";
import { ensureDraftEventForBooking } from "@/lib/events/draft-event.js";
import {
	buildDefaultBookingInstalments,
	STRIPE_MIN_CENTS,
} from "@/lib/bookings/instalments.js";
import { getActiveBookingAgreementSnapshot } from "@/lib/bookings/agreement.js";
import { rollUpBookingPaidAmounts } from "@/lib/bookings/payment-rollup.js";
import { expandPattern } from "@/lib/booking/recurrence.js";
import { booking_segment } from "@/db/schema/entities/booking_segment.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import {
	sendBookingApprovedEmail,
	sendBookingRejectedEmail,
} from "@/utils/email/booking-emails.js";

async function gateAdmin() {
	return requireServerSession({ redirectTo: "/auth/login" });
}

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

const ApproveSchema = z.object({
	booking_id: z.string().uuid(),
	note: z.string().max(2000).optional().nullable(),
	silent: z.boolean().optional().default(false),
});

const RejectSchema = z.object({
	booking_id: z.string().uuid(),
	reason: z.string().max(2000).optional().nullable(),
	silent: z.boolean().optional().default(false),
});

const CancelSchema = z.object({
	booking_id: z.string().uuid(),
	reason: z.string().max(2000).optional().nullable(),
});

const NotesSchema = z.object({
	booking_id: z.string().uuid(),
	internal_notes: z.string().max(4000).optional().nullable(),
});

export async function approveBookingAction(input) {
	const session = await gateAdmin();
	const parsed = ApproveSchema.parse({ ...input, note: nullify(input.note) });

	const [b] = await db.select().from(booking).where(eq(booking.id, parsed.booking_id)).limit(1);
	if (!b) throw new Error("Booking not found");
	if (b.status !== "pending") {
		throw new Error(`Cannot approve a booking in status "${b.status}".`);
	}

	const segments = await listBookingSegments(b.id);
	const roomIds = [...new Set(segments.map((s) => s.room_id).filter(Boolean))];
	if (roomIds.length) {
		const rooms = await db
			.select({ id: room.id, buffer_minutes: room.buffer_minutes })
			.from(room)
			.where(inArray(room.id, roomIds));
		const bufferByRoom = new Map(rooms.map((r) => [r.id, r.buffer_minutes ?? 0]));
		for (const seg of segments) {
			const buf = bufferByRoom.get(seg.room_id) ?? 0;
			const expandedStart = new Date(new Date(seg.starts_at).getTime() - buf * 60000);
			const expandedEnd = new Date(new Date(seg.ends_at).getTime() + buf * 60000);
			const [foundBookings, foundEvents] = await Promise.all([
				findConflictingSegments({
					roomId: seg.room_id,
					startsAt: expandedStart,
					endsAt: expandedEnd,
					excludeBookingIds: [b.id],
				}),
				findConflictingEvents({
					roomId: seg.room_id,
					startsAt: expandedStart,
					endsAt: expandedEnd,
				}),
			]);
			if (foundBookings.length) {
				throw new Error("Cannot approve - another booking now conflicts with this one.");
			}
			if (foundEvents.length) {
				throw new Error("Cannot approve - an event now uses one of these rooms.");
			}
		}
	}

	// Snapshot the venue's currently-active booking agreement onto the
	// booking so the customer always sees / signs the wording that was
	// live at approval time, even if the master copy later changes. The
	// snapshot only goes on once; if the booking already has one (rare
	// re-approval flow), leave it alone.
	const agreementSnapshot = b.agreement_snapshot
		? null
		: await getActiveBookingAgreementSnapshot(b.venue_id);

	const now = new Date();
	const [updated] = await db
		.update(booking)
		.set({
			status: "approved",
			approved_at: now,
			...(agreementSnapshot ? { agreement_snapshot: agreementSnapshot } : {}),
		})
		.where(eq(booking.id, b.id))
		.returning();

	await db.insert(booking_status_event).values({
		booking_id: b.id,
		from_status: b.status,
		to_status: "approved",
		actor_user_id: session.user?.id ?? null,
		note: parsed.note ?? null,
	});

	// Seed default instalments from the deposit policy when none exist.
	// Public submissions land here too — they get the policy default
	// (e.g. 10% deposit + balance, clamped to Stripe's 30p floor)
	// automatically. Admin can override.
	const existingPayments = await listBookingPayments(b.id);
	if (existingPayments.length === 0) {
		const seedSplits = buildDefaultBookingInstalments({
			totalCents: b.total_cents,
			depositRequiredCents: b.deposit_required_cents,
		});
		if (seedSplits.length > 0) {
			await insertBookingPayments(
				seedSplits.map((s, i) => ({
					booking_id: b.id,
					sort_order: i,
					label: s.label,
					amount_cents: s.amount_cents,
					pay_token: payToken(),
				})),
			);
		}
	}

	const [cust] = await db.select().from(customer).where(eq(customer.id, b.customer_id)).limit(1);
	// Safety net for older bookings that pre-date the submission-time hook -
	// the helper is a no-op when an event already exists.
	const draftEvent = await ensureDraftEventForBooking({
		booking: updated,
		customer: cust,
	});

	if (cust && !parsed.silent) {
		await sendBookingApprovedEmail({
			booking: updated,
			customer: cust,
			note: parsed.note,
			event: draftEvent,
		});
	}

	revalidatePath("/admin/bookings");
	revalidatePath(`/admin/bookings/${b.id}`);
	revalidatePath(`/booking/${b.reference}`);
	revalidatePath("/admin/events");
	revalidatePath("/my-bookings");
	revalidatePath("/my-events");
}

export async function rejectBookingAction(input) {
	const session = await gateAdmin();
	const parsed = RejectSchema.parse({ ...input, reason: nullify(input.reason) });

	const [b] = await db.select().from(booking).where(eq(booking.id, parsed.booking_id)).limit(1);
	if (!b) throw new Error("Booking not found");
	if (b.status !== "pending") {
		throw new Error(`Cannot reject a booking in status "${b.status}".`);
	}

	const now = new Date();
	const [updated] = await db
		.update(booking)
		.set({ status: "rejected", rejected_at: now })
		.where(eq(booking.id, b.id))
		.returning();

	await db.insert(booking_status_event).values({
		booking_id: b.id,
		from_status: b.status,
		to_status: "rejected",
		actor_user_id: session.user?.id ?? null,
		note: parsed.reason ?? null,
	});

	const [cust] = await db.select().from(customer).where(eq(customer.id, b.customer_id)).limit(1);
	if (cust && !parsed.silent) {
		await sendBookingRejectedEmail({ booking: updated, customer: cust, reason: parsed.reason });
	}

	revalidatePath("/admin/bookings");
	revalidatePath(`/admin/bookings/${b.id}`);
	revalidatePath(`/booking/${b.reference}`);
}

/**
 * Cancel a booking that's already past the pending stage (approved /
 * confirmed / completed). Flips status to `cancelled`, records the
 * actor on a booking_status_event row, and leaves segments in place so
 * the audit trail is intact. No email is sent - the cancellation is
 * always silent because there's no canonical "cancelled" email yet and
 * the typical use is an internal correction. Pending bookings should
 * use `rejectBookingAction` instead.
 */
export async function cancelBookingAction(input) {
	const session = await gateAdmin();
	const parsed = CancelSchema.parse({ ...input, reason: nullify(input.reason) });

	const [b] = await db.select().from(booking).where(eq(booking.id, parsed.booking_id)).limit(1);
	if (!b) throw new Error("Booking not found");
	if (b.status === "pending") {
		throw new Error("Use Reject for pending bookings.");
	}
	if (b.status === "cancelled" || b.status === "rejected") {
		throw new Error(`Booking is already ${b.status}.`);
	}

	await db
		.update(booking)
		.set({ status: "cancelled", cancelled_at: new Date() })
		.where(eq(booking.id, b.id));

	await db.insert(booking_status_event).values({
		booking_id: b.id,
		from_status: b.status,
		to_status: "cancelled",
		actor_user_id: session.user?.id ?? null,
		note: parsed.reason ?? null,
	});

	revalidatePath("/admin/bookings");
	revalidatePath(`/admin/bookings/${b.id}`);
	revalidatePath(`/booking/${b.reference}`);
	revalidatePath("/admin/events");
	revalidatePath("/my-bookings");
}

const MarkPaidSchema = z.object({
	booking_id: z.string().uuid(),
	note: z.string().max(500).optional().nullable(),
});

/**
 * Admin override: mark the booking's deposit as paid offline (bank transfer,
 * cash, manual Stripe link, etc). Flips status to confirmed without going
 * through the PSP. Idempotent.
 */
export async function markBookingDepositPaidOfflineAction(input) {
	const session = await gateAdmin();
	const parsed = MarkPaidSchema.parse({ ...input, note: nullify(input.note) });

	const { finaliseBookingDeposit } = await import("@/lib/booking/finalize.js");
	const updated = await finaliseBookingDeposit(parsed.booking_id, {
		paymentRef: parsed.note ? `offline: ${parsed.note}` : "offline",
	});

	revalidatePath("/admin/bookings");
	revalidatePath(`/admin/bookings/${parsed.booking_id}`);
	if (updated?.reference) revalidatePath(`/booking/${updated.reference}`);
	return updated;
}

export async function issueBookingBalanceInvoiceAction(input) {
	await gateAdmin();
	const parsed = MarkPaidSchema.parse({ ...input, note: nullify(input.note) });
	const [row] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, parsed.booking_id))
		.limit(1);
	if (!row) throw new Error("Booking not found");
	if (row.status !== "confirmed") {
		throw new Error(`Balance invoice can only be issued on confirmed bookings.`);
	}

	const now = new Date();
	await db
		.update(booking)
		.set({ balance_invoice_issued_at: now })
		.where(eq(booking.id, row.id));

	// Best-effort email.
	try {
		const { sendBookingBalanceInvoiceEmail } = await import(
			"@/utils/email/booking-emails.js"
		);
		const [cust] = await db
			.select()
			.from(customer)
			.where(eq(customer.id, row.customer_id))
			.limit(1);
		if (cust) {
			await sendBookingBalanceInvoiceEmail({ booking: { ...row, balance_invoice_issued_at: now }, customer: cust });
		}
	} catch (err) {
		console.error("[issueBookingBalanceInvoiceAction] email send failed", err);
	}

	revalidatePath("/admin/bookings");
	revalidatePath(`/admin/bookings/${parsed.booking_id}`);
	if (row?.reference) revalidatePath(`/booking/${row.reference}`);
	return { ok: true };
}

/**
 * Admin override: mark the booking's outstanding balance as paid offline.
 * Idempotent - calling again on a fully-settled booking is a no-op.
 */
export async function markBookingBalancePaidOfflineAction(input) {
	await gateAdmin();
	const parsed = MarkPaidSchema.parse({ ...input, note: nullify(input.note) });

	const { finaliseBookingBalance } = await import("@/lib/booking/finalize.js");
	const updated = await finaliseBookingBalance(parsed.booking_id, {
		paymentRef: parsed.note ? `offline: ${parsed.note}` : "offline",
	});

	revalidatePath("/admin/bookings");
	revalidatePath(`/admin/bookings/${parsed.booking_id}`);
	if (updated?.reference) revalidatePath(`/booking/${updated.reference}`);
	return updated;
}

const AssignOrgSchema = z.object({
	booking_id: z.string().uuid(),
	organisation_id: z.string().uuid().nullable(),
});

export async function assignBookingOrganisationAction(input) {
	await gateAdmin();
	const parsed = AssignOrgSchema.parse({
		...input,
		organisation_id: input.organisation_id || null,
	});
	await db
		.update(booking)
		.set({ organisation_id: parsed.organisation_id })
		.where(eq(booking.id, parsed.booking_id));
	revalidatePath(`/admin/bookings/${parsed.booking_id}`);
	revalidatePath("/admin/crm");
	if (parsed.organisation_id) revalidatePath(`/admin/crm/${parsed.organisation_id}`);
	return { ok: true };
}

const OverridePriceSchema = z.object({
	booking_id: z.string().uuid(),
	total_pounds: z.coerce.number().min(0),
	reason: z.string().max(500).optional().nullable(),
});

const ClearOverrideSchema = z.object({
	booking_id: z.string().uuid(),
});

/**
 * Override the booking's total. Recomputes subtotal + VAT preserving the
 * original VAT proportion so downstream reports still round correctly.
 *
 * The pre-override price is snapshotted into `original_subtotal_cents` /
 * `original_vat_cents` / `original_total_cents` the FIRST time we run
 * (subsequent override edits leave those untouched), so the booking
 * detail page can always show "rack price: £X · effective: £Y · saving:
 * £Z" no matter how many times the admin tweaks the override. Clearing
 * the override (`clearBookingOverrideAction`) restores those values and
 * blanks the snapshots back out.
 *
 * Available at any open status (pending / approved / confirmed) so an
 * invoice can still be re-priced when an admin agrees a reduction after
 * the fact. Locked once the booking is in a terminal state.
 */
export async function overrideBookingTotalAction(input) {
	const session = await gateAdmin();
	const parsed = OverridePriceSchema.parse(input);
	const b = await getBookingById(parsed.booking_id);
	if (!b) throw new Error("Booking not found.");
	if (b.status === "rejected" || b.status === "cancelled" || b.status === "completed") {
		throw new Error(`Can't override a ${b.status} booking.`);
	}
	const newTotal = Math.round(parsed.total_pounds * 100);
	const prevTotal = b.total_cents ?? 0;
	const prevVat = b.vat_cents ?? 0;
	const prevSubtotal = b.subtotal_cents ?? 0;
	// Apportion VAT by the original VAT-to-total ratio. If the original
	// had no VAT (or no total), keep VAT at zero.
	const vatRatio = prevTotal > 0 ? prevVat / prevTotal : 0;
	const newVat = Math.round(newTotal * vatRatio);
	const newSubtotal = newTotal - newVat;

	// Snapshot the originals only the FIRST time we override — subsequent
	// edits to the override leave the rack-rate reference untouched so
	// the UI can always show "vs. standard rate".
	const hasExistingSnapshot = b.original_total_cents != null;
	const originalUpdate = hasExistingSnapshot
		? {}
		: {
				original_subtotal_cents: prevSubtotal,
				original_vat_cents: prevVat,
				original_total_cents: prevTotal,
			};

	const updated = await db
		.update(booking)
		.set({
			...originalUpdate,
			total_cents: newTotal,
			vat_cents: newVat,
			subtotal_cents: newSubtotal,
			override_reason: parsed.reason?.trim() || null,
			override_applied_at: new Date(),
			override_by_user_id: session.user?.id ?? null,
		})
		.where(eq(booking.id, parsed.booking_id))
		.returning();

	// Rebalance any unpaid payment splits so the schedule still adds up
	// to the new total. Scale each unpaid row by (new_outstanding /
	// old_outstanding) and absorb rounding into the last row. Paid rows
	// are sacred and never touched. Deposit_required_cents is also
	// rescaled proportionally for the legacy field. See
	// `rebalanceUnpaidPaymentsForNewTotal` below.
	await rebalanceUnpaidPaymentsForNewTotal(b, newTotal);

	revalidatePath(`/admin/bookings/${parsed.booking_id}`);
	revalidatePath("/admin/bookings");
	if (updated[0]?.reference) revalidatePath(`/booking/${updated[0].reference}`);
	return { ok: true, total_cents: newTotal };
}

/**
 * After the booking total changes (override applied or cleared), scale
 * each unpaid `booking_payment` row proportionally so the unpaid rows
 * still sum to the new outstanding balance. Paid rows are not touched.
 * The last unpaid row absorbs any rounding drift so the sum is exact.
 *
 * If there are no unpaid rows (everything's paid or none ever set up),
 * we only update `deposit_required_cents` proportionally so reports
 * that still look at the legacy field stay in sync.
 */
async function rebalanceUnpaidPaymentsForNewTotal(prevBooking, newTotal) {
	const payments = await listBookingPayments(prevBooking.id);
	const paid = payments.filter((p) => p.paid_at);
	const unpaid = payments.filter((p) => !p.paid_at);
	const paidSum = paid.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
	const newOutstanding = Math.max(0, newTotal - paidSum);

	// Rescale the legacy deposit_required_cents in proportion to the
	// total change. e.g. 50% deposit on £400 → 50% deposit on £200.
	const prevTotal = prevBooking.total_cents ?? 0;
	if (prevTotal > 0 && (prevBooking.deposit_required_cents ?? 0) > 0) {
		const scaledDeposit = Math.round(
			((prevBooking.deposit_required_cents ?? 0) * newTotal) / prevTotal,
		);
		await db
			.update(booking)
			.set({ deposit_required_cents: scaledDeposit })
			.where(eq(booking.id, prevBooking.id));
	}

	if (unpaid.length === 0) return;

	const oldUnpaidSum = unpaid.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
	if (oldUnpaidSum === 0) {
		// No unpaid amount to rescale (everything's paid). Nothing to do
		// — the row count is fine, the amounts are zero, leave them.
		return;
	}

	// Scale every unpaid row by the same ratio. Absorb rounding into the
	// final row so the unpaid sum is exactly newOutstanding.
	let runningSum = 0;
	const newAmounts = unpaid.map((p, i) => {
		const isLast = i === unpaid.length - 1;
		if (isLast) return newOutstanding - runningSum;
		const scaled = Math.round((p.amount_cents * newOutstanding) / oldUnpaidSum);
		runningSum += scaled;
		return scaled;
	});

	for (let i = 0; i < unpaid.length; i++) {
		await updateBookingPayment(unpaid[i].id, { amount_cents: newAmounts[i] });
	}
}

/**
 * Remove an override and restore the snapshotted original price. No-op
 * on bookings that were never overridden.
 */
export async function clearBookingOverrideAction(input) {
	await gateAdmin();
	const parsed = ClearOverrideSchema.parse(input);
	const b = await getBookingById(parsed.booking_id);
	if (!b) throw new Error("Booking not found.");
	if (b.original_total_cents == null) {
		return { ok: true, already: true };
	}
	const restoredTotal = b.original_total_cents ?? 0;
	const updated = await db
		.update(booking)
		.set({
			subtotal_cents: b.original_subtotal_cents ?? 0,
			vat_cents: b.original_vat_cents ?? 0,
			total_cents: restoredTotal,
			original_subtotal_cents: null,
			original_vat_cents: null,
			original_total_cents: null,
			override_reason: null,
			override_applied_at: null,
			override_by_user_id: null,
		})
		.where(eq(booking.id, parsed.booking_id))
		.returning();
	// Rescale unpaid splits + the legacy deposit_required_cents back to
	// match the restored total.
	await rebalanceUnpaidPaymentsForNewTotal(b, restoredTotal);
	revalidatePath(`/admin/bookings/${parsed.booking_id}`);
	revalidatePath("/admin/bookings");
	if (updated[0]?.reference) revalidatePath(`/booking/${updated[0].reference}`);
	return { ok: true };
}

export async function saveBookingInternalNotesAction(input) {
	await gateAdmin();
	const parsed = NotesSchema.parse({
		...input,
		internal_notes: nullify(input.internal_notes),
	});
	await db
		.update(booking)
		.set({ internal_notes: parsed.internal_notes ?? null })
		.where(eq(booking.id, parsed.booking_id));
	revalidatePath(`/admin/bookings/${parsed.booking_id}`);
}

const AddRecurrenceSchema = z.object({
	booking_id: z.string().uuid(),
	template_segment_id: z.string().uuid(),
	kind: z.enum(["weekly", "monthly_day", "monthly_weekday"]),
	interval: z.coerce.number().int().min(1).max(12).default(1),
	count: z.coerce.number().int().min(2).max(156).optional().nullable(),
	until_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
	// monthly_day
	day_of_month: z.coerce.number().int().min(1).max(31).optional().nullable(),
	// monthly_weekday
	weekday: z.coerce.number().int().min(0).max(6).optional().nullable(),
	position: z.coerce.number().int().refine((n) => [1, 2, 3, 4, -1].includes(n), {
		message: "Position must be 1, 2, 3, 4, or -1",
	}).optional().nullable(),
}).refine((d) => d.count || d.until_date, {
	message: "Provide either count or until_date",
}).refine(
	(d) => d.kind !== "monthly_day" || d.day_of_month != null,
	{ message: "monthly_day requires day_of_month" },
).refine(
	(d) => d.kind !== "monthly_weekday" || (d.weekday != null && d.position != null),
	{ message: "monthly_weekday requires weekday and position" },
);

/**
 * Extend an existing booking with additional occurrences generated from a
 * recurrence pattern using one of its segments as the template. New
 * `booking_segment` rows are inserted with the same room/booking_type/layout
 * and pricing snapshot as the template. The booking total + deposit are
 * re-summed from segments after.
 *
 * Constraints:
 *  - Booking must be in `pending` or `approved` status (no money committed
 *    yet from the deposit side).
 *  - Skips any generated dates that conflict with existing bookings,
 *    events, or blockouts on the same room - those are returned in
 *    `skipped` for the admin to follow up on.
 */
export async function addRecurringSegmentsAction(input) {
	await gateAdmin();
	const parsed = AddRecurrenceSchema.parse(input);

	const [b] = await db.select().from(booking).where(eq(booking.id, parsed.booking_id)).limit(1);
	if (!b) throw new Error("Booking not found");
	if (b.status !== "pending" && b.status !== "approved") {
		throw new Error(`Can't add recurrence to a ${b.status} booking.`);
	}

	const [template] = await db
		.select()
		.from(booking_segment)
		.where(eq(booking_segment.id, parsed.template_segment_id))
		.limit(1);
	if (!template) throw new Error("Template segment not found");
	if (template.booking_id !== b.id) {
		throw new Error("Template segment is from a different booking.");
	}

	const occurrences = expandPattern({
		templateStart: template.starts_at,
		templateEnd: template.ends_at,
		pattern: {
			kind: parsed.kind,
			interval: parsed.interval,
			count: parsed.count ?? null,
			until_date: parsed.until_date ?? null,
			day_of_month: parsed.day_of_month ?? null,
			weekday: parsed.weekday ?? null,
			position: parsed.position ?? null,
		},
	});
	if (occurrences.length === 0) {
		throw new Error("Recurrence produced no occurrences. Check count / until date.");
	}

	const [r] = await db
		.select({ buffer_minutes: room.buffer_minutes })
		.from(room)
		.where(eq(room.id, template.room_id))
		.limit(1);
	const bufferMs = (r?.buffer_minutes ?? 0) * 60 * 1000;

	const { findConflictingBlockouts } = await import("@/db/queries/bookings.js");

	const accepted = [];
	const skipped = [];
	for (const occ of occurrences) {
		const expandedStart = new Date(occ.starts_at.getTime() - bufferMs);
		const expandedEnd = new Date(occ.ends_at.getTime() + bufferMs);
		const [conflictsBookings, conflictsEvents, conflictsBlockouts] = await Promise.all([
			findConflictingSegments({
				roomId: template.room_id,
				startsAt: expandedStart,
				endsAt: expandedEnd,
				excludeBookingIds: [b.id],
			}),
			findConflictingEvents({
				roomId: template.room_id,
				startsAt: expandedStart,
				endsAt: expandedEnd,
			}),
			findConflictingBlockouts({
				roomId: template.room_id,
				startsAt: expandedStart,
				endsAt: expandedEnd,
			}),
		]);
		if (conflictsBookings.length || conflictsEvents.length || conflictsBlockouts.length) {
			skipped.push({ starts_at: occ.starts_at, ends_at: occ.ends_at });
		} else {
			accepted.push(occ);
		}
	}

	if (accepted.length === 0) {
		throw new Error("Every generated occurrence conflicts with existing bookings, events, or blockouts.");
	}

	// Insert new segments with the same pricing snapshot as the template.
	// We deliberately copy the rate snapshot rather than re-pricing: the admin
	// expects each occurrence to charge what the customer agreed to.
	const baseSortOrder = (template.sort_order ?? 0) + 1;
	await db.insert(booking_segment).values(
		accepted.map((occ, i) => ({
			booking_id: b.id,
			room_id: template.room_id,
			booking_type_id: template.booking_type_id,
			layout_id: template.layout_id,
			starts_at: occ.starts_at,
			ends_at: occ.ends_at,
			rate_snapshot_kind: template.rate_snapshot_kind,
			rate_snapshot_amount_cents: template.rate_snapshot_amount_cents,
			units_x100: template.units_x100,
			vat_rate_snapshot_x100: template.vat_rate_snapshot_x100,
			vat_inclusive_snapshot: template.vat_inclusive_snapshot,
			computed_subtotal_cents: template.computed_subtotal_cents,
			computed_vat_cents: template.computed_vat_cents,
			sort_order: baseSortOrder + i,
		})),
	);

	// Re-sum the booking totals from all active segments + existing addons /
	// discounts. We update subtotal_cents, vat_cents, total_cents and the
	// deposit_required_cents (using the deposit_policy_snapshot stored on
	// the booking, if any).
	const segments = await db
		.select()
		.from(booking_segment)
		.where(and(eq(booking_segment.booking_id, b.id)));
	const activeSegments = segments.filter((s) => !s.deletedAt);
	const segSubtotal = activeSegments.reduce((s, x) => s + (x.computed_subtotal_cents ?? 0), 0);
	const segVat = activeSegments.reduce((s, x) => s + (x.computed_vat_cents ?? 0), 0);

	const setupFee = b.ticketing_setup_fee_cents ?? 0;
	const discount = b.discount_amount_cents ?? 0;
	const subtotal = segSubtotal + setupFee - discount;
	const total = subtotal + segVat;

	// Recompute deposit using the snapshot stored at booking time. Falls back
	// to the old required if no snapshot.
	let depositRequired = b.deposit_required_cents ?? 0;
	const dp = b.deposit_policy_snapshot;
	if (dp) {
		const pct = dp.percent_x100 ?? 0;
		const flat = dp.flat_cents ?? 0;
		const min = dp.min_cents ?? 0;
		depositRequired = Math.max(min, Math.round((total * pct) / 10000) + flat);
	}

	await db
		.update(booking)
		.set({
			subtotal_cents: subtotal,
			vat_cents: segVat,
			total_cents: total,
			deposit_required_cents: depositRequired,
			recurrence_rule: {
				kind: parsed.kind,
				interval: parsed.interval,
				count: parsed.count ?? null,
				until_date: parsed.until_date ?? null,
				template_segment_id: parsed.template_segment_id,
				added_at: new Date().toISOString(),
			},
		})
		.where(eq(booking.id, b.id));

	revalidatePath(`/admin/bookings/${b.id}`);
	return {
		ok: true,
		added: accepted.length,
		skipped,
	};
}

/**
 * Soft-delete an individual segment (skip / cancel one occurrence in a
 * recurring series). Re-sums the booking totals after.
 */
export async function cancelBookingSegmentAction(input) {
	await gateAdmin();
	const Schema = z.object({
		booking_id: z.string().uuid(),
		segment_id: z.string().uuid(),
	});
	const parsed = Schema.parse(input);

	const [seg] = await db
		.select()
		.from(booking_segment)
		.where(eq(booking_segment.id, parsed.segment_id))
		.limit(1);
	if (!seg) throw new Error("Segment not found");
	if (seg.booking_id !== parsed.booking_id) throw new Error("Segment belongs to a different booking");

	await db
		.update(booking_segment)
		.set({ deletedAt: new Date() })
		.where(eq(booking_segment.id, parsed.segment_id));

	const [b] = await db.select().from(booking).where(eq(booking.id, parsed.booking_id)).limit(1);
	if (!b) throw new Error("Booking not found");
	const all = await db
		.select()
		.from(booking_segment)
		.where(eq(booking_segment.booking_id, b.id));
	const active = all.filter((s) => !s.deletedAt);
	const segSubtotal = active.reduce((s, x) => s + (x.computed_subtotal_cents ?? 0), 0);
	const segVat = active.reduce((s, x) => s + (x.computed_vat_cents ?? 0), 0);
	const setupFee = b.ticketing_setup_fee_cents ?? 0;
	const discount = b.discount_amount_cents ?? 0;
	const subtotal = segSubtotal + setupFee - discount;
	const total = subtotal + segVat;
	await db
		.update(booking)
		.set({ subtotal_cents: subtotal, vat_cents: segVat, total_cents: total })
		.where(eq(booking.id, b.id));

	revalidatePath(`/admin/bookings/${parsed.booking_id}`);
	return { ok: true };
}

/* ---------------- instalments ---------------- */

function payToken() {
	return randomBytes(18).toString("base64url");
}

const PaymentRowSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	label: z.string().min(1).max(120),
	amount_cents: z.coerce.number().int().min(0),
});

const ReplacePaymentsSchema = z.object({
	booking_id: z.string().uuid(),
	rows: z.array(PaymentRowSchema).min(1, "Add at least one payment."),
});

/**
 * Replace the booking's payment instalments with the supplied set.
 * Sum must equal the booking total. Refuses to touch rows that have
 * already been paid — those stay, and only un-paid rows are reshuffled
 * around them.
 */
export async function replaceBookingPaymentsAction(input) {
	await gateAdmin();
	const parsed = ReplacePaymentsSchema.parse(input);
	const b = await getBookingById(parsed.booking_id);
	if (!b) throw new Error("Booking not found.");

	const existing = await listBookingPayments(parsed.booking_id);
	const paidExisting = existing.filter((p) => p.paid_at);
	const paidSum = paidExisting.reduce((s, p) => s + (p.amount_cents ?? 0), 0);

	// Validate sum
	const incomingSum = parsed.rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0);
	const expected = (b.total_cents ?? 0) - paidSum;
	if (incomingSum !== expected) {
		throw new Error(
			`Payments must sum to ${(expected / 100).toFixed(2)} (was ${(incomingSum / 100).toFixed(2)}).`,
		);
	}

	// Stripe rejects PaymentIntents below 30p. If any unpaid row is below
	// that floor it can never be charged via card, so block the save and
	// nudge the admin to merge it into another split.
	const undersized = parsed.rows.find((r) => (r.amount_cents ?? 0) < STRIPE_MIN_CENTS);
	if (undersized) {
		throw new Error(
			`Each split must be at least £${(STRIPE_MIN_CENTS / 100).toFixed(2)} (Stripe minimum) — "${undersized.label}" is £${((undersized.amount_cents ?? 0) / 100).toFixed(2)}.`,
		);
	}

	// Soft-delete un-paid existing rows
	const paidIds = new Set(paidExisting.map((p) => p.id));
	const toDelete = existing.filter((p) => !paidIds.has(p.id));
	for (const p of toDelete) {
		await softDeleteBookingPayment(p.id);
	}

	// Insert new un-paid rows, leaving paid rows in place at the top
	const startOrder = paidExisting.length;
	await insertBookingPayments(
		parsed.rows.map((r, i) => ({
			booking_id: parsed.booking_id,
			sort_order: startOrder + i,
			label: r.label.trim(),
			amount_cents: r.amount_cents,
			pay_token: payToken(),
		})),
	);

	revalidatePath(`/admin/bookings/${parsed.booking_id}`);
	return { ok: true };
}

const MarkOfflineSchema = z.object({
	booking_payment_id: z.string().uuid(),
	note: z.string().max(500).optional().nullable(),
});

export async function markBookingPaymentPaidOfflineAction(input) {
	await gateAdmin();
	const parsed = MarkOfflineSchema.parse(input);
	const [row] = await db
		.select()
		.from(booking_payment)
		.where(eq(booking_payment.id, parsed.booking_payment_id))
		.limit(1);
	if (!row) throw new Error("Payment not found.");
	if (row.paid_at) return { ok: true, already: true };
	await updateBookingPayment(parsed.booking_payment_id, {
		paid_at: new Date(),
		paid_via: "offline",
		offline_note: parsed.note?.trim() || null,
	});
	await rollUpBookingPaidAmounts(row.booking_id);
	revalidatePath(`/admin/bookings/${row.booking_id}`);
	return { ok: true };
}

const UnmarkOfflineSchema = z.object({
	booking_payment_id: z.string().uuid(),
});

export async function unmarkBookingPaymentPaidAction(input) {
	await gateAdmin();
	const parsed = UnmarkOfflineSchema.parse(input);
	const [row] = await db
		.select()
		.from(booking_payment)
		.where(eq(booking_payment.id, parsed.booking_payment_id))
		.limit(1);
	if (!row) throw new Error("Payment not found.");
	if (row.paid_via !== "offline") {
		throw new Error("Only offline payments can be reversed here.");
	}
	await updateBookingPayment(parsed.booking_payment_id, {
		paid_at: null,
		paid_via: null,
		offline_note: null,
	});
	await rollUpBookingPaidAmounts(row.booking_id);
	revalidatePath(`/admin/bookings/${row.booking_id}`);
	return { ok: true };
}

const SendLinkSchema = z.object({
	booking_payment_id: z.string().uuid(),
});

export async function sendBookingPaymentLinkAction(input) {
	await gateAdmin();
	const parsed = SendLinkSchema.parse(input);
	const [row] = await db
		.select()
		.from(booking_payment)
		.where(eq(booking_payment.id, parsed.booking_payment_id))
		.limit(1);
	if (!row) throw new Error("Payment not found.");
	if (row.paid_at) throw new Error("That payment has already been paid.");
	const b = await getBookingById(row.booking_id);
	if (!b) throw new Error("Booking not found.");
	const { sendBookingPaymentLinkEmail } = await import(
		"@/utils/email/booking-emails.js"
	);
	await sendBookingPaymentLinkEmail({
		booking: b,
		customer: {
			email: b.customer_email,
			first_name: b.customer_first_name,
		},
		payment: row,
	});
	await updateBookingPayment(parsed.booking_payment_id, { sent_at: new Date() });
	revalidatePath(`/admin/bookings/${row.booking_id}`);
	return { ok: true };
}

const SendInvoiceSchema = z.object({
	booking_id: z.string().uuid(),
	// Optional — when omitted the email goes out for the FULL booking
	// total instead of a single scheduled payment.
	booking_payment_id: z.string().uuid().optional().nullable(),
});

/**
 * Build the booking invoice PDF (per-payment or full-booking) and email
 * it to the customer. Doesn't transition any status — purely a delivery
 * action. Marks the payment row's `sent_at` when scoped to a single
 * payment so the row gets the "sent" pill.
 */
export async function sendBookingInvoiceAction(input) {
	await gateAdmin();
	const parsed = SendInvoiceSchema.parse(input);
	const b = await getBookingById(parsed.booking_id);
	if (!b) throw new Error("Booking not found.");

	let payment = null;
	if (parsed.booking_payment_id) {
		const [row] = await db
			.select()
			.from(booking_payment)
			.where(eq(booking_payment.id, parsed.booking_payment_id))
			.limit(1);
		if (!row || row.booking_id !== b.id) {
			throw new Error("Payment not found.");
		}
		payment = row;
	}

	const [
		segments,
		payments,
		{ listBookingFacilitySelections },
		{ getVenueById },
		{ getOrganisationWithContact },
	] = await Promise.all([
		listBookingSegments(b.id),
		listBookingPayments(b.id),
		import("@/db/queries/bookings.js"),
		import("@/db/queries/venue.js"),
		import("@/db/queries/crm.js"),
	]);
	const [facilities, venueRow, organisation] = await Promise.all([
		listBookingFacilitySelections(b.id),
		getVenueById(b.venue_id),
		b.organisation_id ? getOrganisationWithContact(b.organisation_id) : null,
	]);

	// Prefer the linked CRM org's primary contact over the legacy
	// booking-time customer snapshot. See the route handler for the
	// rationale.
	const customer = organisation?.contact_first_name
		? {
				first_name: organisation.contact_first_name,
				last_name: organisation.contact_last_name,
				email: organisation.contact_email,
			}
		: {
				first_name: b.customer_first_name,
				last_name: b.customer_last_name,
				email: b.customer_email,
			};

	const { buildBookingInvoicePdfBuffer } = await import(
		"@/lib/bookings/invoice-pdf.js"
	);
	const pdfBuffer = await buildBookingInvoicePdfBuffer({
		booking: b,
		payment,
		payments,
		segments: segments.map((s) => ({
			id: s.id,
			room_name: s.room_name,
			starts_at: s.starts_at,
			ends_at: s.ends_at,
			booking_type_label: s.booking_type_label,
			rate_snapshot_kind: s.rate_snapshot_kind,
			rate_snapshot_amount_cents: s.rate_snapshot_amount_cents,
			units_x100: s.units_x100,
			subtotal_cents: s.computed_subtotal_cents,
		})),
		facilities,
		customer,
		organisation,
		venue: venueRow,
	});

	const { sendBookingInvoiceEmail } = await import(
		"@/utils/email/booking-emails.js"
	);
	await sendBookingInvoiceEmail({
		booking: b,
		customer,
		payment,
		pdfBuffer,
	});

	if (payment) {
		await updateBookingPayment(payment.id, { sent_at: new Date() });
	}
	revalidatePath(`/admin/bookings/${b.id}`);
	return { ok: true };
}

const SwitchToFullPaymentSchema = z.object({
	booking_id: z.string().uuid(),
});

/**
 * Collapse all unpaid `booking_payment` rows into a single "Full
 * payment" row covering the remaining outstanding balance. Paid rows
 * stay where they are. Used when the customer asks to settle the rest
 * in one go instead of working through the existing schedule.
 *
 * No-op when nothing is unpaid OR when there's already exactly one
 * unpaid row that would BE the full payment.
 */
export async function switchToFullPaymentAction(input) {
	await gateAdmin();
	const parsed = SwitchToFullPaymentSchema.parse(input);
	const b = await getBookingById(parsed.booking_id);
	if (!b) throw new Error("Booking not found.");

	const payments = await listBookingPayments(b.id);
	const paid = payments.filter((p) => p.paid_at);
	const unpaid = payments.filter((p) => !p.paid_at);
	const paidSum = paid.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
	const outstanding = (b.total_cents ?? 0) - paidSum;

	if (outstanding <= 0) {
		throw new Error("Booking is already paid in full.");
	}
	if (unpaid.length === 1 && unpaid[0].amount_cents === outstanding) {
		return { ok: true, already: true };
	}

	for (const p of unpaid) {
		await softDeleteBookingPayment(p.id);
	}

	await insertBookingPayments([
		{
			booking_id: b.id,
			sort_order: paid.length,
			label: "Full payment",
			amount_cents: outstanding,
			pay_token: payToken(),
		},
	]);

	revalidatePath(`/admin/bookings/${b.id}`);
	return { ok: true };
}

// rollUpBookingPaidAmounts moved to lib/bookings/payment-rollup.js so the
// banking auto-matcher can call it too.
