import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { room_blockout } from "@/db/schema/entities/room_blockout.js";
import { room_blockout_room } from "@/db/schema/entities/room_blockout_room.js";
import { room } from "@/db/schema/entities/room.js";
import { requireCurrentVenue } from "@/db/queries/venue";
import { listRoomsForAdmin } from "@/db/queries/rooms";
import BlockoutsClient from "./client";

export const dynamic = "force-dynamic";

export default async function BlockoutsPage() {
	const venue = await requireCurrentVenue();
	const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);

	const [blockouts, rooms] = await Promise.all([
		db
			.select({
				id: room_blockout.id,
				starts_at: room_blockout.starts_at,
				ends_at: room_blockout.ends_at,
				reason: room_blockout.reason,
				notes: room_blockout.notes,
				is_public: room_blockout.is_public,
				series_id: room_blockout.series_id,
			})
			.from(room_blockout)
			.where(
				and(
					eq(room_blockout.venue_id, venue.id),
					isNull(room_blockout.deletedAt),
					gte(room_blockout.ends_at, cutoff),
				),
			)
			.orderBy(asc(room_blockout.starts_at)),
		listRoomsForAdmin(venue.id),
	]);

	const blockoutIds = blockouts.map((b) => b.id);
	const links = blockoutIds.length
		? await db
				.select({
					blockout_id: room_blockout_room.blockout_id,
					room_id: room_blockout_room.room_id,
					room_name: room.name,
				})
				.from(room_blockout_room)
				.innerJoin(room, eq(room.id, room_blockout_room.room_id))
				.where(inArray(room_blockout_room.blockout_id, blockoutIds))
		: [];

	const roomsByBlockout = new Map();
	for (const l of links) {
		if (!roomsByBlockout.has(l.blockout_id)) roomsByBlockout.set(l.blockout_id, []);
		roomsByBlockout.get(l.blockout_id).push({ id: l.room_id, name: l.room_name });
	}
	const blockoutsWithRooms = blockouts.map((b) => ({
		...b,
		rooms: roomsByBlockout.get(b.id) ?? [],
	}));

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Room blockouts</h1>
				<p className="mt-1 text-sm text-muted-foreground max-w-2xl">
					Dates when one or more rooms are unavailable — maintenance, private events, holidays.
					New bookings can't be made over these. Blockouts ending more than 30 days ago are hidden.
				</p>
			</div>
			<BlockoutsClient blockouts={blockoutsWithRooms} rooms={rooms} />
		</div>
	);
}
