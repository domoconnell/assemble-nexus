import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { room_blockout } from "@/db/schema/entities/room_blockout.js";
import { room_blockout_room } from "@/db/schema/entities/room_blockout_room.js";
import { listRoomsForAdmin } from "@/db/queries/rooms";
import { requireCurrentVenue } from "@/db/queries/venue";
import ChurchEventForm from "../_components/church-event-form";

export const dynamic = "force-dynamic";

export default async function EditChurchEventPage({ params }) {
	const { id } = await params;
	const venue = await requireCurrentVenue();

	const [row] = await db
		.select()
		.from(room_blockout)
		.where(
			and(
				eq(room_blockout.id, id),
				eq(room_blockout.venue_id, venue.id),
				eq(room_blockout.kind, "church"),
				isNull(room_blockout.deletedAt),
			),
		)
		.limit(1);
	if (!row) notFound();

	const links = await db
		.select({ room_id: room_blockout_room.room_id })
		.from(room_blockout_room)
		.where(eq(room_blockout_room.blockout_id, row.id));

	const rooms = await listRoomsForAdmin(venue.id);

	const initial = {
		id: row.id,
		reason: row.reason,
		notes: row.notes,
		is_public: row.is_public,
		starts_at: row.starts_at,
		ends_at: row.ends_at,
		recurrence_rule: row.recurrence_rule,
		room_ids: links.map((l) => l.room_id),
	};

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-6">
			<div>
				<Link href="/admin/church-events" className="text-sm text-muted-foreground hover:text-foreground">
					← Church events
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Edit church event</h1>
			</div>
			<ChurchEventForm rooms={rooms} initial={initial} />
		</div>
	);
}
