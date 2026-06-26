import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import { expandRecurrence } from "@/lib/church-events/recurrence.js";
import { db } from "@/db/index.js";
import { booking } from "@/db/schema/entities/booking.js";
import { booking_segment } from "@/db/schema/entities/booking_segment.js";
import { booking_facility_selection } from "@/db/schema/entities/booking_facility_selection.js";
import { booking_status_event } from "@/db/schema/entities/booking_status_event.js";
import { booking_payment } from "@/db/schema/entities/booking_payment.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";
import { customer } from "@/db/schema/entities/customer.js";
import { room } from "@/db/schema/entities/room.js";
import { room_blockout } from "@/db/schema/entities/room_blockout.js";
import { room_blockout_room } from "@/db/schema/entities/room_blockout_room.js";
import { tenancy, tenancy_line, tenancy_session } from "@/db/schema/entities/tenancy.js";
import { capacity_layout } from "@/db/schema/entities/capacity_layout.js";
import { deposit_policy } from "@/db/schema/entities/deposit_policy.js";
import { event } from "@/db/schema/entities/event.js";
import { event_room } from "@/db/schema/entities/event_room.js";
import { psp_intent } from "@/db/schema/entities/psp_intent.js";
import { user } from "@/db/schema/entities/user.js";

export async function getActiveDepositPolicy(venueId) {
	const [row] = await db
		.select()
		.from(deposit_policy)
		.where(
			and(
				eq(deposit_policy.venue_id, venueId),
				eq(deposit_policy.is_active, true),
				isNull(deposit_policy.deletedAt),
			),
		)
		.orderBy(desc(deposit_policy.createdAt))
		.limit(1);
	return row ?? null;
}

export async function getBookingByReference(reference) {
	const [b] = await db
		.select({
			id: booking.id,
			venue_id: booking.venue_id,
			reference: booking.reference,
			status: booking.status,
			subtotal_cents: booking.subtotal_cents,
			vat_cents: booking.vat_cents,
			total_cents: booking.total_cents,
			original_subtotal_cents: booking.original_subtotal_cents,
			original_vat_cents: booking.original_vat_cents,
			original_total_cents: booking.original_total_cents,
			override_reason: booking.override_reason,
			override_applied_at: booking.override_applied_at,
			override_by_user_id: booking.override_by_user_id,
			discount_id: booking.discount_id,
			discount_label_snapshot: booking.discount_label_snapshot,
			discount_percent_x100_snapshot: booking.discount_percent_x100_snapshot,
			discount_amount_cents: booking.discount_amount_cents,
			ticketing_enabled: booking.ticketing_enabled,
			ticketing_setup_fee_pct_x100_snapshot: booking.ticketing_setup_fee_pct_x100_snapshot,
			ticketing_setup_fee_cents: booking.ticketing_setup_fee_cents,
			deposit_required_cents: booking.deposit_required_cents,
			deposit_non_refundable_cents: booking.deposit_non_refundable_cents,
			deposit_paid_cents: booking.deposit_paid_cents,
			balance_paid_cents: booking.balance_paid_cents,
			customer_notes: booking.customer_notes,
			submitted_at: booking.submitted_at,
			approved_at: booking.approved_at,
			confirmed_at: booking.confirmed_at,
			rejected_at: booking.rejected_at,
			cancelled_at: booking.cancelled_at,
			completed_at: booking.completed_at,
			customer_first_name: customer.first_name,
			customer_last_name: customer.last_name,
			customer_email: customer.email,
		})
		.from(booking)
		.innerJoin(customer, eq(booking.customer_id, customer.id))
		.where(and(eq(booking.reference, reference), isNull(booking.deletedAt)))
		.limit(1);
	return b ?? null;
}

export async function getBookingById(id) {
	const [b] = await db
		.select({
			id: booking.id,
			venue_id: booking.venue_id,
			reference: booking.reference,
			status: booking.status,
			organisation_id: booking.organisation_id,
			recurrence_rule: booking.recurrence_rule,
			subtotal_cents: booking.subtotal_cents,
			vat_cents: booking.vat_cents,
			total_cents: booking.total_cents,
			original_subtotal_cents: booking.original_subtotal_cents,
			original_vat_cents: booking.original_vat_cents,
			original_total_cents: booking.original_total_cents,
			override_reason: booking.override_reason,
			override_applied_at: booking.override_applied_at,
			override_by_user_id: booking.override_by_user_id,
			discount_id: booking.discount_id,
			discount_label_snapshot: booking.discount_label_snapshot,
			discount_percent_x100_snapshot: booking.discount_percent_x100_snapshot,
			discount_amount_cents: booking.discount_amount_cents,
			ticketing_enabled: booking.ticketing_enabled,
			ticketing_setup_fee_pct_x100_snapshot: booking.ticketing_setup_fee_pct_x100_snapshot,
			ticketing_setup_fee_cents: booking.ticketing_setup_fee_cents,
			deposit_required_cents: booking.deposit_required_cents,
			deposit_non_refundable_cents: booking.deposit_non_refundable_cents,
			deposit_paid_cents: booking.deposit_paid_cents,
			balance_paid_cents: booking.balance_paid_cents,
			balance_invoice_issued_at: booking.balance_invoice_issued_at,
			balance_paid_at: booking.balance_paid_at,
			customer_notes: booking.customer_notes,
			internal_notes: booking.internal_notes,
			submitted_at: booking.submitted_at,
			approved_at: booking.approved_at,
			confirmed_at: booking.confirmed_at,
			rejected_at: booking.rejected_at,
			cancelled_at: booking.cancelled_at,
			completed_at: booking.completed_at,
			customer_id: customer.id,
			customer_user_id: customer.user_id,
			customer_first_name: customer.first_name,
			customer_last_name: customer.last_name,
			customer_email: customer.email,
			customer_phone: customer.phone,
			customer_organisation: customer.organisation,
			customer_marketing_opt_in: customer.marketing_opt_in,
		})
		.from(booking)
		.innerJoin(customer, eq(booking.customer_id, customer.id))
		.where(and(eq(booking.id, id), isNull(booking.deletedAt)))
		.limit(1);
	return b ?? null;
}

export async function listBookingSegments(bookingId) {
	return db
		.select({
			id: booking_segment.id,
			booking_id: booking_segment.booking_id,
			starts_at: booking_segment.starts_at,
			ends_at: booking_segment.ends_at,
			rate_snapshot_kind: booking_segment.rate_snapshot_kind,
			rate_snapshot_amount_cents: booking_segment.rate_snapshot_amount_cents,
			units_x100: booking_segment.units_x100,
			vat_rate_snapshot_x100: booking_segment.vat_rate_snapshot_x100,
			computed_subtotal_cents: booking_segment.computed_subtotal_cents,
			computed_vat_cents: booking_segment.computed_vat_cents,
			sort_order: booking_segment.sort_order,
			room_name: room.name,
			room_slug: room.slug,
			booking_type_label: booking_type.label,
			booking_type_key: booking_type.key,
			layout_label: capacity_layout.label,
			layout_icon: capacity_layout.icon,
		})
		.from(booking_segment)
		.innerJoin(room, eq(booking_segment.room_id, room.id))
		.innerJoin(booking_type, eq(booking_segment.booking_type_id, booking_type.id))
		.leftJoin(capacity_layout, eq(booking_segment.layout_id, capacity_layout.id))
		.where(and(eq(booking_segment.booking_id, bookingId), isNull(booking_segment.deletedAt)))
		.orderBy(asc(booking_segment.sort_order), asc(booking_segment.starts_at));
}

export async function listBookingFacilitySelections(bookingId) {
	return db
		.select()
		.from(booking_facility_selection)
		.where(eq(booking_facility_selection.booking_id, bookingId))
		.orderBy(asc(booking_facility_selection.sort_order));
}

export async function listBookingStatusEvents(bookingId) {
	return db
		.select({
			id: booking_status_event.id,
			booking_id: booking_status_event.booking_id,
			from_status: booking_status_event.from_status,
			to_status: booking_status_event.to_status,
			actor_user_id: booking_status_event.actor_user_id,
			note: booking_status_event.note,
			at: booking_status_event.at,
			actor_first_name: user.first_name,
			actor_last_name: user.last_name,
		})
		.from(booking_status_event)
		.leftJoin(user, eq(user.id, booking_status_event.actor_user_id))
		.where(eq(booking_status_event.booking_id, bookingId))
		.orderBy(asc(booking_status_event.at));
}

export async function listBookingsForAdmin(venueId, { tab = "all" } = {}) {
	const conditions = [eq(booking.venue_id, venueId), isNull(booking.deletedAt)];
	if (tab === "pending") {
		conditions.push(inArray(booking.status, ["pending"]));
	} else if (tab === "upcoming") {
		conditions.push(inArray(booking.status, ["approved", "confirmed"]));
	} else if (tab === "past") {
		conditions.push(inArray(booking.status, ["rejected", "cancelled", "completed"]));
	}

	const { organisation } = await import("@/db/schema/entities/organisation.js");
	const { contact } = await import("@/db/schema/entities/contact.js");
	const rows = await db
		.select({
			id: booking.id,
			reference: booking.reference,
			status: booking.status,
			total_cents: booking.total_cents,
			submitted_at: booking.submitted_at,
			ticketing_enabled: booking.ticketing_enabled,
			// Legacy booking-time snapshot of the hirer. Stays as-is once
			// the booking is linked to a CRM org — admins keep the CRM
			// contact current, not this row.
			customer_first_name: customer.first_name,
			customer_last_name: customer.last_name,
			customer_email: customer.email,
			customer_organisation: customer.organisation,
			// Linked CRM organisation + its primary contact — preferred
			// display when set since these track the live records as the
			// admin edits the CRM. Null on bookings that were never
			// linked to a CRM org.
			linked_organisation_name: organisation.name,
			linked_contact_first_name: contact.first_name,
			linked_contact_last_name: contact.last_name,
			linked_contact_email: contact.email,
		})
		.from(booking)
		.innerJoin(customer, eq(booking.customer_id, customer.id))
		.leftJoin(organisation, eq(organisation.id, booking.organisation_id))
		.leftJoin(contact, eq(contact.id, organisation.primary_contact_id))
		.where(and(...conditions))
		.orderBy(desc(booking.submitted_at));
	return rows;
}

export async function listBookingsForUser(userId) {
	const { contact } = await import("@/db/schema/entities/contact.js");
	const { organisation_contact } = await import("@/db/schema/entities/organisation_contact.js");
	const { organisation } = await import("@/db/schema/entities/organisation.js");

	const selectShape = {
		id: booking.id,
		reference: booking.reference,
		status: booking.status,
		total_cents: booking.total_cents,
		submitted_at: booking.submitted_at,
		ticketing_enabled: booking.ticketing_enabled,
		organisation_name: organisation.name,
	};

	const [viaCustomer, viaOrganisation] = await Promise.all([
		db
			.select(selectShape)
			.from(booking)
			.innerJoin(customer, eq(booking.customer_id, customer.id))
			.leftJoin(organisation, eq(organisation.id, booking.organisation_id))
			.where(and(eq(customer.user_id, userId), isNull(booking.deletedAt))),
		db
			.select(selectShape)
			.from(booking)
			.innerJoin(organisation_contact, eq(organisation_contact.organisation_id, booking.organisation_id))
			.innerJoin(contact, eq(contact.id, organisation_contact.contact_id))
			.leftJoin(organisation, eq(organisation.id, booking.organisation_id))
			.where(
				and(
					eq(contact.user_id, userId),
					isNull(contact.deletedAt),
					isNull(booking.deletedAt),
				),
			),
	]);

	const byId = new Map();
	for (const r of viaCustomer) byId.set(r.id, r);
	for (const r of viaOrganisation) byId.set(r.id, r);
	return [...byId.values()].sort((a, b) => {
		const aTime = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
		const bTime = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
		return bTime - aTime;
	});
}

export async function getBookingForUser(bookingId, userId) {
	const [b] = await db
		.select({
			id: booking.id,
			venue_id: booking.venue_id,
			reference: booking.reference,
			status: booking.status,
			subtotal_cents: booking.subtotal_cents,
			vat_cents: booking.vat_cents,
			total_cents: booking.total_cents,
			discount_label_snapshot: booking.discount_label_snapshot,
			discount_amount_cents: booking.discount_amount_cents,
			ticketing_enabled: booking.ticketing_enabled,
			ticketing_setup_fee_cents: booking.ticketing_setup_fee_cents,
			deposit_required_cents: booking.deposit_required_cents,
			deposit_paid_cents: booking.deposit_paid_cents,
			balance_paid_cents: booking.balance_paid_cents,
			agreement_snapshot: booking.agreement_snapshot,
			agreement_accepted_at: booking.agreement_accepted_at,
			customer_notes: booking.customer_notes,
			submitted_at: booking.submitted_at,
			approved_at: booking.approved_at,
			confirmed_at: booking.confirmed_at,
			rejected_at: booking.rejected_at,
			cancelled_at: booking.cancelled_at,
			completed_at: booking.completed_at,
			customer_first_name: customer.first_name,
			customer_last_name: customer.last_name,
			customer_email: customer.email,
		})
		.from(booking)
		.innerJoin(customer, eq(booking.customer_id, customer.id))
		.where(
			and(
				eq(booking.id, bookingId),
				eq(customer.user_id, userId),
				isNull(booking.deletedAt),
			),
		)
		.limit(1);
	return b ?? null;
}

export async function countPendingBookings(venueId) {
	const rows = await db
		.select({ id: booking.id })
		.from(booking)
		.where(
			and(
				eq(booking.venue_id, venueId),
				eq(booking.status, "pending"),
				isNull(booking.deletedAt),
			),
		);
	return rows.length;
}

/**
 * Total outstanding across approved/confirmed bookings - what hirers
 * still owe the venue. Excludes pending (not yet approved) and finished
 * statuses.
 */
/**
 * Outstanding payments split by whether the booking's event(s) fall in
 * the current month vs the past. For each booking we compute:
 *   - unpaid_deposit  = max(0, deposit_required - deposit_paid)
 *   - unpaid_balance  = max(0, (total - deposit_required) - balance_paid)
 * Then classify by segment date: if any segment lands in the [from, to)
 * window → "this month"; if all segments ended before `from` → "previous".
 * Future-only bookings are excluded (they're upcoming obligations, not
 * what the board is reviewing this month).
 *
 * Excludes pending/rejected/cancelled bookings - only approved,
 * confirmed, or completed count, in line with `sumOutstandingBalances`.
 */
export async function sumPaymentsOwedSplit(venueId, fromDate, toDate) {
	const fromIso = fromDate.toISOString();
	const toIso = toDate.toISOString();
	const rows = await db.execute(sql`
		WITH per_booking AS (
			SELECT
				b.id,
				b.total_cents,
				b.deposit_required_cents,
				b.deposit_paid_cents,
				b.balance_paid_cents,
				BOOL_OR(s.starts_at >= ${fromIso} AND s.starts_at < ${toIso}) AS has_this_month,
				MAX(s.starts_at) < ${fromIso} AS all_previous
			FROM booking b
			INNER JOIN booking_segment s ON s.booking_id = b.id AND s.deleted_at IS NULL
			WHERE b.venue_id = ${venueId}
				AND b.deleted_at IS NULL
				AND b.status IN ('approved', 'confirmed', 'completed')
			GROUP BY b.id
		)
		SELECT
			CASE
				WHEN has_this_month THEN 'this_month'
				WHEN all_previous THEN 'previous'
				ELSE NULL
			END AS bucket,
			COALESCE(SUM(GREATEST(0, deposit_required_cents - deposit_paid_cents)), 0)::int
				AS unpaid_deposits,
			COALESCE(SUM(GREATEST(0, (total_cents - deposit_required_cents) - balance_paid_cents)), 0)::int
				AS unpaid_balances
		FROM per_booking
		WHERE has_this_month OR all_previous
		GROUP BY bucket
	`);
	const blank = { unpaid_deposits: 0, unpaid_balances: 0, total: 0 };
	const out = { this_month: { ...blank }, previous: { ...blank } };
	for (const r of rows.rows ?? rows) {
		if (!r.bucket) continue;
		const d = Number(r.unpaid_deposits) || 0;
		const b = Number(r.unpaid_balances) || 0;
		out[r.bucket] = { unpaid_deposits: d, unpaid_balances: b, total: d + b };
	}
	return out;
}

export async function sumOutstandingBalances(venueId) {
	const [row] = await db
		.select({
			total_cents: sql`coalesce(sum(${booking.total_cents}), 0)::int`,
			paid_cents: sql`coalesce(sum(${booking.deposit_paid_cents} + ${booking.balance_paid_cents}), 0)::int`,
		})
		.from(booking)
		.where(
			and(
				eq(booking.venue_id, venueId),
				inArray(booking.status, ["approved", "confirmed"]),
				isNull(booking.deletedAt),
			),
		);
	const total = Number(row?.total_cents ?? 0);
	const paid = Number(row?.paid_cents ?? 0);
	return Math.max(0, total - paid);
}

/**
 * Booking segments overlapping the [start, end) window. Used by the
 * admin dashboard's "today" and "next 7 days" views. Joins through to
 * room and booking so the UI can render meaningfully.
 */
export async function listSegmentsInRange(venueId, start, end) {
	return db
		.select({
			segment_id: booking_segment.id,
			starts_at: booking_segment.starts_at,
			ends_at: booking_segment.ends_at,
			booking_id: booking.id,
			booking_reference: booking.reference,
			booking_status: booking.status,
			room_id: room.id,
			room_name: room.name,
		})
		.from(booking_segment)
		.innerJoin(booking, eq(booking_segment.booking_id, booking.id))
		.innerJoin(room, eq(booking_segment.room_id, room.id))
		.where(
			and(
				eq(booking.venue_id, venueId),
				isNull(booking.deletedAt),
				notInArray(booking.status, ["rejected", "cancelled"]),
				lt(booking_segment.starts_at, end),
				gt(booking_segment.ends_at, start),
			),
		)
		.orderBy(asc(booking_segment.starts_at));
}

/**
 * Events (with their picked rooms) whose start falls inside the window.
 * Dashboard pairs this with `listSegmentsInRange` for a unified view.
 */
/**
 * Blockouts whose window overlaps [start, end). The room link is left-joined
 * so venue-wide blockouts (no rooms linked) still come through with a null
 * room_name.
 */
export async function listBlockoutsInRange(venueId, start, end) {
	const [nonRecurring, definitions] = await Promise.all([
		db
			.select({
				id: room_blockout.id,
				starts_at: room_blockout.starts_at,
				ends_at: room_blockout.ends_at,
				reason: room_blockout.reason,
				is_public: room_blockout.is_public,
				room_id: room.id,
				room_name: room.name,
			})
			.from(room_blockout)
			.leftJoin(room_blockout_room, eq(room_blockout_room.blockout_id, room_blockout.id))
			.leftJoin(room, eq(room.id, room_blockout_room.room_id))
			.where(
				and(
					eq(room_blockout.venue_id, venueId),
					isNull(room_blockout.recurrence_rule),
					isNull(room_blockout.deletedAt),
					lt(room_blockout.starts_at, end),
					gt(room_blockout.ends_at, start),
				),
			)
			.orderBy(asc(room_blockout.starts_at)),
		db
			.select({
				id: room_blockout.id,
				reason: room_blockout.reason,
				is_public: room_blockout.is_public,
				recurrence_rule: room_blockout.recurrence_rule,
				room_id: room.id,
				room_name: room.name,
			})
			.from(room_blockout)
			.leftJoin(room_blockout_room, eq(room_blockout_room.blockout_id, room_blockout.id))
			.leftJoin(room, eq(room.id, room_blockout_room.room_id))
			.where(
				and(
					eq(room_blockout.venue_id, venueId),
					isNotNull(room_blockout.recurrence_rule),
					isNull(room_blockout.deletedAt),
				),
			),
	]);

	const expanded = [];
	for (const def of definitions) {
		const hits = expandRecurrence(def.recurrence_rule, { from: start, until: end });
		for (const h of hits) {
			if (h.starts_at < end && h.ends_at > start) {
				expanded.push({
					id: def.id,
					starts_at: h.starts_at,
					ends_at: h.ends_at,
					reason: def.reason,
					is_public: def.is_public,
					room_id: def.room_id,
					room_name: def.room_name,
				});
			}
		}
	}

	return [...nonRecurring, ...expanded].sort(
		(a, b) => new Date(a.starts_at) - new Date(b.starts_at),
	);
}

/**
 * Per-day activity counts for the dashboard's calendar heatmap. Returns a
 * map keyed by ISO date (London local) with counts of bookings, events,
 * and blockouts that touch that day.
 */
export async function listDayActivityForMonth(venueId, monthStartDate, monthEndDate) {
	const start = monthStartDate;
	const end = monthEndDate;
	const [segments, events, blockoutRows, tenancySessions] = await Promise.all([
		listSegmentsInRange(venueId, start, end),
		listEventsInRange(venueId, start, end),
		listBlockoutsInRange(venueId, start, end),
		// Tenancy sessions go on the heatmap too — they're real bookings
		// against the calendar even though they were materialised from a
		// tenancy schedule rather than a one-off booking row.
		//
		// INNER JOIN tenancy_line (was: not joined) so sessions whose
		// underlying line has been deleted (or never had one) don't
		// inflate the count. The schedule widget already filters those
		// out via the same join; this keeps the calendar tooltip
		// consistent with what's actually rendered below it.
		db
			.select({ starts_at: tenancy_session.starts_at })
			.from(tenancy_session)
			.innerJoin(tenancy, eq(tenancy_session.tenancy_id, tenancy.id))
			.innerJoin(tenancy_line, eq(tenancy_session.tenancy_line_id, tenancy_line.id))
			.where(
				and(
					eq(tenancy.venue_id, venueId),
					isNull(tenancy.deletedAt),
					isNull(tenancy_line.deletedAt),
					isNull(tenancy_session.deletedAt),
					eq(tenancy_session.status, "scheduled"),
					lt(tenancy_session.starts_at, end),
					gt(tenancy_session.ends_at, start),
				),
			),
	]);
	const blockouts = blockoutRows;

	const map = new Map();
	const touch = (key, type) => {
		const e = map.get(key) ?? { bookings: 0, events: 0, blockouts: 0, total: 0 };
		e[type] += 1;
		e.total += 1;
		map.set(key, e);
	};
	const dayKey = (d) =>
		new Intl.DateTimeFormat("en-CA", {
			timeZone: "Europe/London",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(d);

	for (const s of segments) {
		touch(dayKey(new Date(s.starts_at)), "bookings");
	}
	for (const ts of tenancySessions) {
		touch(dayKey(new Date(ts.starts_at)), "bookings");
	}
	for (const ev of events) {
		if (ev.starts_at) touch(dayKey(new Date(ev.starts_at)), "events");
	}
	// listBlockoutsInRange fans out one row per (blockout × room ×
	// expanded occurrence). For the heatmap we count distinct
	// occurrences, so dedupe by (blockout id + starts_at) before tallying.
	const seenBlockoutOccurrences = new Set();
	for (const b of blockouts) {
		const occKey = `${b.id}-${new Date(b.starts_at).getTime()}`;
		if (seenBlockoutOccurrences.has(occKey)) continue;
		seenBlockoutOccurrences.add(occKey);
		touch(dayKey(new Date(b.starts_at)), "blockouts");
	}
	return Object.fromEntries(map);
}

export async function listEventsInRange(venueId, start, end) {
	return db
		.select({
			event_id: event.id,
			title: event.title,
			starts_at: event.starts_at,
			ends_at: event.ends_at,
			status: event.status,
			room_id: room.id,
			room_name: room.name,
		})
		.from(event)
		.leftJoin(event_room, eq(event_room.event_id, event.id))
		.leftJoin(room, eq(event_room.room_id, room.id))
		.where(
			and(
				eq(event.venue_id, venueId),
				isNull(event.deletedAt),
				notInArray(event.status, ["cancelled", "past"]),
				lt(event.starts_at, end),
				gt(event.ends_at, start),
			),
		)
		.orderBy(asc(event.starts_at));
}

export async function getPendingIntentForBooking(bookingId, kind = "deposit") {
	const rows = await db
		.select()
		.from(psp_intent)
		.where(
			and(
				eq(psp_intent.booking_id, bookingId),
				eq(psp_intent.status, "requires_payment_method"),
				sql`coalesce(${psp_intent.metadata}->>'kind', 'deposit') = ${kind}`,
			),
		)
		.orderBy(desc(psp_intent.createdAt))
		.limit(1);
	return rows[0] ?? null;
}

export async function getSucceededIntentForBooking(bookingId) {
	const rows = await db
		.select()
		.from(psp_intent)
		.where(
			and(
				eq(psp_intent.booking_id, bookingId),
				eq(psp_intent.status, "succeeded"),
			),
		)
		.orderBy(desc(psp_intent.createdAt))
		.limit(1);
	return rows[0] ?? null;
}

const BLOCKING_STATUSES = ["pending", "approved", "confirmed", "completed"];

const BLOCKING_EVENT_STATUSES = ["draft", "pending_review", "published"];

/**
 * Find events that have manually-picked rooms (via event_room) overlapping the
 * requested window on the given room. Events linked to a booking are already
 * blocked through findConflictingSegments via that booking's segments, so we
 * exclude them here to avoid double-counting.
 */
export async function findConflictingEvents({
	roomId,
	startsAt,
	endsAt,
	excludeEventIds = [],
}) {
	const conditions = [
		eq(event_room.room_id, roomId),
		isNull(event.deletedAt),
		isNull(event.booking_id),
		lt(event.starts_at, endsAt),
		gt(event.ends_at, startsAt),
		inArray(event.status, BLOCKING_EVENT_STATUSES),
	];
	if (excludeEventIds.length) {
		conditions.push(notInArray(event.id, excludeEventIds));
	}
	return db
		.select({
			id: event.id,
			title: event.title,
			status: event.status,
			starts_at: event.starts_at,
			ends_at: event.ends_at,
		})
		.from(event_room)
		.innerJoin(event, eq(event_room.event_id, event.id))
		.where(and(...conditions))
		.orderBy(asc(event.starts_at));
}

/**
 * Find any room_blockout rows that overlap [startsAt, endsAt) for the given
 * room. A blockout with NO linked rooms applies to every room at its venue,
 * so we match those too via the `not exists` clause.
 */
export async function findConflictingBlockouts({ roomId, startsAt, endsAt }) {
	const roomRow = await db
		.select({ venue_id: room.venue_id })
		.from(room)
		.where(eq(room.id, roomId))
		.limit(1);
	if (!roomRow.length) return [];
	const venueId = roomRow[0].venue_id;

	const roomFilter = sql`(
		exists (
			select 1 from ${room_blockout_room} rbr
			where rbr.blockout_id = ${room_blockout.id}
			  and rbr.room_id = ${roomId}
		)
		or not exists (
			select 1 from ${room_blockout_room} rbr
			where rbr.blockout_id = ${room_blockout.id}
		)
	)`;

	const [nonRecurring, definitions] = await Promise.all([
		// One-off blockouts + venue closures + adhoc church events: their
		// own starts_at/ends_at IS the occurrence, no expansion needed.
		db
			.select({
				id: room_blockout.id,
				starts_at: room_blockout.starts_at,
				ends_at: room_blockout.ends_at,
				reason: room_blockout.reason,
				is_public: room_blockout.is_public,
			})
			.from(room_blockout)
			.where(
				and(
					eq(room_blockout.venue_id, venueId),
					isNull(room_blockout.recurrence_rule),
					isNull(room_blockout.deletedAt),
					lt(room_blockout.starts_at, endsAt),
					gt(room_blockout.ends_at, startsAt),
					roomFilter,
				),
			)
			.orderBy(asc(room_blockout.starts_at)),

		// Recurring church-event definitions: load once, expand into
		// occurrences against the requested [startsAt, endsAt) window.
		db
			.select({
				id: room_blockout.id,
				reason: room_blockout.reason,
				is_public: room_blockout.is_public,
				recurrence_rule: room_blockout.recurrence_rule,
			})
			.from(room_blockout)
			.where(
				and(
					eq(room_blockout.venue_id, venueId),
					isNotNull(room_blockout.recurrence_rule),
					isNull(room_blockout.deletedAt),
					roomFilter,
				),
			),
	]);

	const expanded = [];
	for (const def of definitions) {
		const hits = expandRecurrence(def.recurrence_rule, { from: startsAt, until: endsAt });
		for (const h of hits) {
			// Drop occurrences that don't actually overlap the requested
			// window (expand returns starts inside [from, until] but ends
			// may extend beyond - check the overlap explicitly).
			if (h.starts_at < endsAt && h.ends_at > startsAt) {
				expanded.push({
					id: def.id,
					starts_at: h.starts_at,
					ends_at: h.ends_at,
					reason: def.reason,
					is_public: def.is_public,
				});
			}
		}
	}

	return [...nonRecurring, ...expanded].sort(
		(a, b) => new Date(a.starts_at) - new Date(b.starts_at),
	);
}

export async function findConflictingSegments({
	roomId,
	startsAt,
	endsAt,
	excludeBookingIds = [],
}) {
	const conditions = [
		eq(booking_segment.room_id, roomId),
		isNull(booking_segment.deletedAt),
		lt(booking_segment.starts_at, endsAt),
		gt(booking_segment.ends_at, startsAt),
		inArray(booking.status, BLOCKING_STATUSES),
		isNull(booking.deletedAt),
	];
	if (excludeBookingIds.length) {
		conditions.push(notInArray(booking_segment.booking_id, excludeBookingIds));
	}
	return db
		.select({
			id: booking_segment.id,
			booking_id: booking_segment.booking_id,
			booking_reference: booking.reference,
			booking_status: booking.status,
			starts_at: booking_segment.starts_at,
			ends_at: booking_segment.ends_at,
		})
		.from(booking_segment)
		.innerJoin(booking, eq(booking_segment.booking_id, booking.id))
		.where(and(...conditions))
		.orderBy(asc(booking_segment.starts_at));
}

/* ---------------- booking instalments ---------------- */

export async function listBookingPayments(bookingId) {
	return db
		.select()
		.from(booking_payment)
		.where(
			and(
				eq(booking_payment.booking_id, bookingId),
				isNull(booking_payment.deletedAt),
			),
		)
		.orderBy(asc(booking_payment.sort_order), asc(booking_payment.createdAt));
}

export async function getBookingPaymentByToken(token) {
	if (!token) return null;
	const [row] = await db
		.select({
			payment: booking_payment,
			booking_id: booking.id,
			booking_reference: booking.reference,
			booking_status: booking.status,
			booking_total_cents: booking.total_cents,
			venue_id: booking.venue_id,
			agreement_snapshot: booking.agreement_snapshot,
			agreement_accepted_at: booking.agreement_accepted_at,
			customer_first_name: customer.first_name,
			customer_last_name: customer.last_name,
			customer_email: customer.email,
		})
		.from(booking_payment)
		.innerJoin(booking, eq(booking.id, booking_payment.booking_id))
		.innerJoin(customer, eq(customer.id, booking.customer_id))
		.where(
			and(
				eq(booking_payment.pay_token, token),
				isNull(booking_payment.deletedAt),
				isNull(booking.deletedAt),
			),
		)
		.limit(1);
	if (!row) return null;
	return { ...row.payment, ...row, payment: undefined };
}

export async function getBookingPaymentByStripeIntent(paymentIntentId) {
	if (!paymentIntentId) return null;
	const [row] = await db
		.select()
		.from(booking_payment)
		.where(
			and(
				eq(booking_payment.stripe_payment_intent_id, paymentIntentId),
				isNull(booking_payment.deletedAt),
			),
		)
		.limit(1);
	return row ?? null;
}

export async function insertBookingPayments(rows) {
	if (!rows?.length) return [];
	return db.insert(booking_payment).values(rows).returning();
}

export async function updateBookingPayment(id, patch) {
	const [row] = await db
		.update(booking_payment)
		.set(patch)
		.where(eq(booking_payment.id, id))
		.returning();
	return row;
}

export async function softDeleteBookingPayment(id) {
	await db
		.update(booking_payment)
		.set({ deletedAt: new Date() })
		.where(eq(booking_payment.id, id));
}
