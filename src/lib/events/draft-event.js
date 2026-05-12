import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { event } from "@/db/schema/entities/event.js";
import { ticket_type } from "@/db/schema/entities/ticket_type.js";
import {
	findOrganiserByEmailDomain,
	linkUserToOrganiser,
} from "@/db/queries/organisers.js";
import { generateUniqueEventSlug } from "@/lib/events/slug.js";

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
