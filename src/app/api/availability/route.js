import { z } from "zod";
import { eq } from "drizzle-orm";
import { json } from "@/utils/auth/auth-guard.js";
import { db } from "@/db/index.js";
import { room } from "@/db/schema/entities/room.js";
import {
	findConflictingSegments,
	findConflictingEvents,
	findConflictingBlockouts,
} from "@/db/queries/bookings.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
	room_id: z.string().uuid(),
	starts_at: z.string(),
	ends_at: z.string(),
	exclude_booking_ids: z.array(z.string().uuid()).optional().default([]),
});

export async function POST(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "Invalid JSON" });
	}

	const parsed = QuerySchema.safeParse(body);
	if (!parsed.success) {
		return json(400, { error: "Invalid request", issues: parsed.error.issues });
	}

	const startsAt = new Date(parsed.data.starts_at);
	const endsAt = new Date(parsed.data.ends_at);
	if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf())) {
		return json(400, { error: "Invalid dates" });
	}
	if (endsAt <= startsAt) {
		return json(400, { error: "ends_at must be after starts_at" });
	}

	const [r] = await db
		.select({ id: room.id, buffer_minutes: room.buffer_minutes })
		.from(room)
		.where(eq(room.id, parsed.data.room_id))
		.limit(1);
	if (!r) return json(404, { error: "Room not found" });

	const bufferMs = (r.buffer_minutes ?? 0) * 60 * 1000;
	const expandedStart = new Date(startsAt.getTime() - bufferMs);
	const expandedEnd = new Date(endsAt.getTime() + bufferMs);

	const [segmentConflicts, eventConflicts, blockoutConflicts] = await Promise.all([
		findConflictingSegments({
			roomId: r.id,
			startsAt: expandedStart,
			endsAt: expandedEnd,
			excludeBookingIds: parsed.data.exclude_booking_ids,
		}),
		findConflictingEvents({
			roomId: r.id,
			startsAt: expandedStart,
			endsAt: expandedEnd,
		}),
		findConflictingBlockouts({
			roomId: r.id,
			startsAt: expandedStart,
			endsAt: expandedEnd,
		}),
	]);

	const conflicts = [
		...segmentConflicts.map((c) => ({
			kind: "booking",
			label: `Existing booking ${c.booking_reference}`,
			starts_at: c.starts_at,
			ends_at: c.ends_at,
			status: c.booking_status,
			booking_id: c.booking_id,
			booking_reference: c.booking_reference,
		})),
		...eventConflicts.map((e) => ({
			kind: "event",
			label: `Event: ${e.title}`,
			starts_at: e.starts_at,
			ends_at: e.ends_at,
			status: e.status,
			event_id: e.id,
		})),
		...blockoutConflicts.map((b) => ({
			kind: "blockout",
			label: `Unavailable: ${b.reason}`,
			starts_at: b.starts_at,
			ends_at: b.ends_at,
			blockout_id: b.id,
			is_public: b.is_public,
		})),
	].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

	return json(200, {
		available: conflicts.length === 0,
		buffer_minutes: r.buffer_minutes ?? 0,
		conflicts,
	});
}
