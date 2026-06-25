import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { event } from "@/db/schema/entities/event.js";
import { ticket_type } from "@/db/schema/entities/ticket_type.js";
import {
	findOrganiserByEmailDomain,
	linkUserToOrganiser,
} from "@/db/queries/organisers.js";
import { generateUniqueEventSlug } from "@/lib/events/slug.js";
import { listBookingSegments } from "@/db/queries/bookings.js";

/**
 * Derive sensible default doors / starts / ends times for a brand-new
 * event from the booking's `event`-keyed segments. The booker is expected
 * to tweak these in the When tab, but pre-filling means the event has a
 * concrete schedule the moment it's created, which is what the public
 * listings + ticketing flow assume.
 *
 * Logic:
 *  - Window = first event segment's start → last event segment's end.
 *  - doors_open_at = window start (guests can arrive when the booking starts).
 *  - starts_at = window start + 30 min (or window start when the window
 *    is shorter than 30 min, so we never fall outside it).
 *  - ends_at = window end.
 *
 * Returns null when there are no event-keyed segments yet (rare —
 * happens for pre-validation bookings), and the caller skips the times.
 */
function deriveDefaultEventTimes(eventSegments) {
	if (!Array.isArray(eventSegments) || eventSegments.length === 0) return null;
	const sorted = [...eventSegments].sort(
		(a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
	);
	const windowStart = new Date(sorted[0].starts_at);
	const windowEnd = new Date(sorted[sorted.length - 1].ends_at);
	const halfHour = 30 * 60 * 1000;
	const startsCandidate = new Date(windowStart.getTime() + halfHour);
	const startsAt = startsCandidate > windowEnd ? windowStart : startsCandidate;
	return {
		doors_open_at: windowStart,
		starts_at: startsAt,
		ends_at: windowEnd,
	};
}

/**
 * Idempotently create a draft event for a booking. Called both at
 * booking-submission time (so the hirer can refine the event while the
 * booking is pending) and from the approval flow as a safety net for older
 * bookings that pre-date the submission-time hook.
 *
 * Returns the existing event row when one is already linked.
 */
export async function ensureDraftEventForBooking({
	booking: b,
	customer: cust,
	pendingTicketTypes = null,
}) {
	if (!b?.ticketing_enabled) return null;

	const [existing] = await db
		.select()
		.from(event)
		.where(and(eq(event.booking_id, b.id), isNull(event.deletedAt)))
		.limit(1);
	if (existing) return existing;

	let organiserId = null;
	if (cust?.email) {
		const org = await findOrganiserByEmailDomain(b.venue_id, cust.email);
		if (org) organiserId = org.id;
	}
	if (organiserId && cust?.user_id) {
		await linkUserToOrganiser({
			userId: cust.user_id,
			organiserId,
			role: "member",
		});
	}

	const seedTitle = `Event for ${b.reference}`;
	const slug = await generateUniqueEventSlug(b.venue_id, seedTitle);

	const segments = await listBookingSegments(b.id);
	const eventSegments = segments.filter((s) => s.booking_type_key === "event");
	const defaultTimes = deriveDefaultEventTimes(eventSegments);

	const [inserted] = await db
		.insert(event)
		.values({
			venue_id: b.venue_id,
			slug,
			title: seedTitle,
			status: "draft",
			visibility: "private",
			is_ticketed: true,
			booking_id: b.id,
			event_organiser_id: organiserId,
			organiser_organisation_id: b.organisation_id ?? null,
			...(defaultTimes ?? {}),
		})
		.returning();

	const types = Array.isArray(pendingTicketTypes) ? pendingTicketTypes : [];
	if (types.length) {
		await db.insert(ticket_type).values(
			types.map((t, i) => ({
				event_id: inserted.id,
				name: String(t.name ?? "").slice(0, 200) || "Ticket",
				price_cents: Number.isFinite(Number(t.price_cents)) ? Number(t.price_cents) : 0,
				max_quantity: t.max_quantity ? Number(t.max_quantity) : null,
				sort_order: Number.isFinite(Number(t.sort_order)) ? Number(t.sort_order) : i,
			})),
		);
	}

	return inserted;
}
