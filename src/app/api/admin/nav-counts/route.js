import { and, count, eq, isNull } from "drizzle-orm";
import { auth } from "@/utils/auth/auth.js";
import { db } from "@/db/index.js";
import { booking } from "@/db/schema/entities/booking.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status, body) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * Light-weight counts the sidebar uses to render notification badges.
 * Currently:
 *   bookings_pending - bookings awaiting admin review (status=pending).
 *
 * Extend by adding more rollups; the response shape is a flat object so
 * the client can match on key without ceremony.
 */
export async function GET(request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) return json(401, { error: "Unauthorised" });

	const venue = await requireCurrentVenue();

	const [pending] = await db
		.select({ value: count() })
		.from(booking)
		.where(
			and(
				eq(booking.venue_id, venue.id),
				eq(booking.status, "pending"),
				isNull(booking.deletedAt),
			),
		);

	return json(200, {
		bookings_pending: Number(pending?.value ?? 0),
	});
}
