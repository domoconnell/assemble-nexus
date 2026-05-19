import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { room } from "@/db/schema/entities/room.js";
import { event } from "@/db/schema/entities/event.js";

/**
 * Pulls the data the public header + footer need to render a dynamic nav:
 *   rooms             - published rooms (one nav item each)
 *   hasUpcomingEvents - true when at least one published, public, future event exists
 *
 * Returned in one query each so the layout's render is cheap.
 */
export async function getPublicNavData(venueId) {
	const [rooms, upcoming] = await Promise.all([
		db
			.select({
				id: room.id,
				name: room.name,
				slug: room.slug,
			})
			.from(room)
			.where(
				and(
					eq(room.venue_id, venueId),
					eq(room.is_published, true),
					eq(room.is_public, true),
					isNull(room.deletedAt),
				),
			)
			.orderBy(asc(room.sort_order), asc(room.name)),
		db
			.select({ id: event.id })
			.from(event)
			.where(
				and(
					eq(event.venue_id, venueId),
					eq(event.visibility, "public"),
					eq(event.status, "published"),
					gte(event.starts_at, new Date()),
					isNull(event.deletedAt),
				),
			)
			.limit(1),
	]);

	return {
		rooms,
		hasUpcomingEvents: upcoming.length > 0,
	};
}
