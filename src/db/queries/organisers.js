import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { event_organiser } from "@/db/schema/entities/event_organiser.js";
import { user_event_organiser } from "@/db/schema/entities/user_event_organiser.js";

function notDeleted(t) {
	return isNull(t.deletedAt);
}

export async function listEventOrganisers(venueId) {
	return db
		.select()
		.from(event_organiser)
		.where(and(eq(event_organiser.venue_id, venueId), notDeleted(event_organiser)))
		.orderBy(asc(event_organiser.name));
}

export async function getEventOrganiserById(id) {
	const [row] = await db
		.select()
		.from(event_organiser)
		.where(and(eq(event_organiser.id, id), notDeleted(event_organiser)))
		.limit(1);
	return row ?? null;
}

export async function findOrganiserByEmailDomain(venueId, email) {
	const at = email?.lastIndexOf("@");
	if (at < 0) return null;
	const domain = email.slice(at + 1).trim().toLowerCase();
	if (!domain) return null;
	const [row] = await db
		.select()
		.from(event_organiser)
		.where(
			and(
				eq(event_organiser.venue_id, venueId),
				eq(event_organiser.email_domain, domain),
				notDeleted(event_organiser),
			),
		)
		.limit(1);
	return row ?? null;
}

export async function listOrganisersForUser(userId) {
	return db
		.select({
			id: event_organiser.id,
			venue_id: event_organiser.venue_id,
			slug: event_organiser.slug,
			name: event_organiser.name,
			role: user_event_organiser.role,
		})
		.from(user_event_organiser)
		.innerJoin(event_organiser, eq(user_event_organiser.event_organiser_id, event_organiser.id))
		.where(and(eq(user_event_organiser.user_id, userId), notDeleted(event_organiser)))
		.orderBy(asc(event_organiser.name));
}

export async function linkUserToOrganiser({ userId, organiserId, role = "member" }) {
	await db
		.insert(user_event_organiser)
		.values({ user_id: userId, event_organiser_id: organiserId, role })
		.onConflictDoNothing();
}
