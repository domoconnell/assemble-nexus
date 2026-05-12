import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { json } from "@/utils/auth/auth-guard.js";
import { db } from "@/db/index.js";
import { customer } from "@/db/schema/entities/customer.js";
import { booking } from "@/db/schema/entities/booking.js";
import { booking_segment } from "@/db/schema/entities/booking_segment.js";
import { booking_status_event } from "@/db/schema/entities/booking_status_event.js";
import { booking_facility_selection } from "@/db/schema/entities/booking_facility_selection.js";
import { room } from "@/db/schema/entities/room.js";
import { priceQuote, computeDeposit } from "@/lib/booking/pricing.js";
import { generateBookingReference } from "@/lib/booking/reference.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import {
	getActiveDepositPolicy,
	findConflictingSegments,
	findConflictingEvents,
	findConflictingBlockouts,
} from "@/db/queries/bookings.js";
import {
	sendEnquiryReceivedEmail,
	sendStaffNotificationEmail,
} from "@/utils/email/booking-emails.js";
import { findOrCreateUserForCustomer } from "@/utils/auth/account-linking.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SegmentSchema = z.object({
	room_id: z.string().uuid(),
	booking_type_id: z.string().uuid(),
	layout_id: z.string().uuid().optional().nullable(),
	starts_at: z.string(),
	ends_at: z.string(),
});

const FacilitySelectionSchema = z.object({
	facility_package_id: z.string().uuid(),
	quantity: z.coerce.number().int().min(1).max(50).default(1),
});

const CustomerSchema = z.object({
	first_name: z.string().min(1).max(120),
	last_name: z.string().min(1).max(120),
	email: z.string().email().max(254),
	phone: z.string().max(80).optional().nullable(),
	organisation: z.string().max(200).optional().nullable(),
	marketing_opt_in: z.coerce.boolean().optional().default(false),
});

const TicketingSchema = z.object({
	enabled: z.coerce.boolean().optional().default(false),
	room_id: z.string().uuid().optional().nullable(),
});

// `recurrence_rule` is captured client-side after the customer toggled
// "make recurring" — the segments array has already been expanded to include
// every occurrence, so we just store the rule here for audit / display.
const RecurrenceRuleSchema = z
	.object({
		kind: z.enum(["weekly", "monthly_day", "monthly_weekday"]),
		interval: z.coerce.number().int().min(1).max(12).optional(),
		day_of_month: z.coerce.number().int().min(1).max(31).optional().nullable(),
		weekday: z.coerce.number().int().min(0).max(6).optional().nullable(),
		position: z.coerce.number().int().optional().nullable(),
		count: z.coerce.number().int().min(2).max(156).optional().nullable(),
		until_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
	})
	.passthrough();

const BodySchema = z.object({
	customer: CustomerSchema,
	segments: z.array(SegmentSchema).min(1).max(200),
	facility_selections: z.array(FacilitySelectionSchema).max(40).optional().default([]),
	discount_id: z.string().uuid().optional().nullable(),
	ticketing: TicketingSchema.optional().nullable(),
	customer_notes: z.string().max(2000).optional().nullable(),
	recurrence_rule: RecurrenceRuleSchema.optional().nullable(),
});

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

export async function POST(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "Invalid JSON" });
	}

	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) {
		return json(400, { error: "Invalid request", issues: parsed.error.issues });
	}

	const venue = await requireCurrentVenue();
	const quote = await priceQuote({
		venueId: venue.id,
		segments: parsed.data.segments,
		facilitySelections: parsed.data.facility_selections,
		discountId: parsed.data.discount_id ?? null,
		ticketing: parsed.data.ticketing ?? null,
	});

	const segmentErrors = quote.segments.filter((s) => s.error);
	const facilityErrors = (quote.facilities ?? []).filter((f) => f.error);
	if (segmentErrors.length || facilityErrors.length) {
		return json(400, {
			error: "One or more lines could not be priced.",
			segments: quote.segments,
			facilities: quote.facilities,
		});
	}

	const roomIds = [...new Set(parsed.data.segments.map((s) => s.room_id))];
	const rooms = await db
		.select({ id: room.id, buffer_minutes: room.buffer_minutes })
		.from(room)
		.where(inArray(room.id, roomIds));
	const bufferByRoom = new Map(rooms.map((r) => [r.id, r.buffer_minutes ?? 0]));

	const conflicts = [];
	for (const seg of parsed.data.segments) {
		const buffer = bufferByRoom.get(seg.room_id) ?? 0;
		const startsAt = new Date(seg.starts_at);
		const endsAt = new Date(seg.ends_at);
		const expandedStart = new Date(startsAt.getTime() - buffer * 60000);
		const expandedEnd = new Date(endsAt.getTime() + buffer * 60000);
		const [foundBookings, foundEvents, foundBlockouts] = await Promise.all([
			findConflictingSegments({
				roomId: seg.room_id,
				startsAt: expandedStart,
				endsAt: expandedEnd,
			}),
			findConflictingEvents({
				roomId: seg.room_id,
				startsAt: expandedStart,
				endsAt: expandedEnd,
			}),
			findConflictingBlockouts({
				roomId: seg.room_id,
				startsAt: expandedStart,
				endsAt: expandedEnd,
			}),
		]);
		if (foundBookings.length || foundEvents.length || foundBlockouts.length) {
			conflicts.push({
				segment: seg,
				conflicts: [...foundBookings, ...foundEvents, ...foundBlockouts],
			});
		}
	}
	if (conflicts.length) {
		return json(409, {
			error: "One or more dates conflict with existing bookings or events.",
			conflicts,
		});
	}

	const depositPolicy = await getActiveDepositPolicy(venue.id);
	const deposit = computeDeposit({ totalCents: quote.total_cents, depositPolicy });

	const c = parsed.data.customer;
	const linkedUser = await findOrCreateUserForCustomer({
		email: c.email,
		first_name: c.first_name,
		last_name: c.last_name,
		phone: c.phone,
		roleKey: "hirer",
	});

	const [createdCustomer] = await db
		.insert(customer)
		.values({
			first_name: c.first_name,
			last_name: c.last_name,
			email: c.email,
			phone: nullify(c.phone),
			organisation: nullify(c.organisation),
			marketing_opt_in: !!c.marketing_opt_in,
			user_id: linkedUser.id,
		})
		.returning();

	let createdBooking = null;
	for (let attempt = 0; attempt < 5; attempt++) {
		const reference = generateBookingReference();
		try {
			const [b] = await db
				.insert(booking)
				.values({
					venue_id: venue.id,
					reference,
					customer_id: createdCustomer.id,
					status: "pending",
					subtotal_cents: quote.subtotal_cents,
					vat_cents: quote.vat_cents,
					total_cents: quote.total_cents,
					discount_id: quote.discount?.id ?? null,
					discount_label_snapshot: quote.discount?.label ?? null,
					discount_percent_x100_snapshot: quote.discount?.percent_x100 ?? null,
					discount_amount_cents: quote.discount?.amount_cents ?? 0,
					ticketing_enabled: !!quote.ticketing?.enabled,
					ticketing_setup_fee_pct_x100_snapshot: quote.ticketing?.setup_fee_pct_x100 ?? null,
					ticketing_setup_fee_cents: quote.ticketing?.setup_fee_cents ?? 0,
					deposit_required_cents: deposit.required_cents,
					deposit_non_refundable_cents: deposit.non_refundable_cents,
					deposit_policy_snapshot: depositPolicy
						? {
							deposit_pct_x100: depositPolicy.deposit_pct_x100,
							non_refundable_pct_x100: depositPolicy.non_refundable_pct_x100,
							refundable_until_days_before: depositPolicy.refundable_until_days_before,
						}
						: null,
					customer_notes: nullify(parsed.data.customer_notes),
					recurrence_rule: parsed.data.recurrence_rule ?? null,
				})
				.returning();
			createdBooking = b;
			break;
		} catch (err) {
			if (err?.code === "23505" || /duplicate/i.test(err?.message || "")) {
				continue;
			}
			throw err;
		}
	}

	if (!createdBooking) {
		return json(500, { error: "Could not generate a unique booking reference. Please try again." });
	}

	const segmentRows = parsed.data.segments.map((s, i) => {
		const priced = quote.segments[i];
		return {
			booking_id: createdBooking.id,
			room_id: s.room_id,
			booking_type_id: s.booking_type_id,
			layout_id: nullify(s.layout_id),
			starts_at: new Date(s.starts_at),
			ends_at: new Date(s.ends_at),
			rate_snapshot_kind: priced.rate_snapshot_kind,
			rate_snapshot_amount_cents: priced.rate_snapshot_amount_cents,
			units_x100: priced.units_x100,
			vat_rate_snapshot_x100: priced.vat_rate_snapshot_x100,
			vat_inclusive_snapshot: priced.vat_inclusive_snapshot,
			computed_subtotal_cents: priced.computed_subtotal_cents,
			computed_vat_cents: priced.computed_vat_cents,
			sort_order: i,
		};
	});

	if (segmentRows.length) {
		await db.insert(booking_segment).values(segmentRows);
	}

	if (parsed.data.facility_selections.length) {
		const facilityRows = parsed.data.facility_selections.map((sel, i) => {
			const priced = quote.facilities[i];
			return {
				booking_id: createdBooking.id,
				facility_package_id: sel.facility_package_id,
				quantity: priced.quantity,
				name_snapshot: priced.name_snapshot,
				price_snapshot_cents: priced.price_snapshot_cents,
				vat_rate_snapshot_x100: priced.vat_rate_snapshot_x100,
				vat_inclusive_snapshot: priced.vat_inclusive_snapshot,
				computed_subtotal_cents: priced.computed_subtotal_cents,
				computed_vat_cents: priced.computed_vat_cents,
				sort_order: i,
			};
		});
		await db.insert(booking_facility_selection).values(facilityRows);
	}

	await db.insert(booking_status_event).values({
		booking_id: createdBooking.id,
		from_status: null,
		to_status: "pending",
		note: "Submitted by customer.",
	});

	await Promise.all([
		sendEnquiryReceivedEmail({ booking: createdBooking, customer: createdCustomer }),
		sendStaffNotificationEmail({ booking: createdBooking, customer: createdCustomer }),
	]);

	return json(201, { reference: createdBooking.reference, id: createdBooking.id });
}
