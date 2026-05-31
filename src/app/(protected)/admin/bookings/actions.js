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
} from "@/db/queries/bookings.js";
import { room } from "@/db/schema/entities/room.js";
import { ensureDraftEventForBooking } from "@/lib/events/draft-event.js";
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

	const now = new Date();
	const [updated] = await db
		.update(booking)
		.set({ status: "approved", approved_at: now })
		.where(eq(booking.id, b.id))
		.returning();

	await db.insert(booking_status_event).values({
		booking_id: b.id,
		from_status: b.status,
		to_status: "approved",
		actor_user_id: session.user?.id ?? null,
		note: parsed.note ?? null,
	});

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
