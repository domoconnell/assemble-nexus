import Link from "next/link";
import { Button } from "@/shadcn/components/ui/button";
import { Badge } from "@/shadcn/components/ui/badge";
import { listRoomsForAdmin } from "@/db/queries/rooms";
import { requireCurrentVenue } from "@/db/queries/venue";

export const dynamic = "force-dynamic";

export default async function AdminRoomsPage() {
	const venue = await requireCurrentVenue();
	const rooms = await listRoomsForAdmin(venue.id);

	const publicRooms = rooms.filter((r) => r.is_public !== false);
	const privateRooms = rooms.filter((r) => r.is_public === false);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-6xl">
			<div className="flex items-center justify-between gap-4 mb-8">
				<div>
					<h1 className="text-2xl font-semibold">Rooms</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Public rooms appear on the booking site. Non-public rooms are
						admin-only - used for tenant offices and other private spaces.
					</p>
				</div>
				<Button asChild>
					<Link href="/admin/rooms/new">New room</Link>
				</Button>
			</div>

			<div className="rounded-lg border bg-card overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr className="border-b text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
							<th className="px-4 py-3 font-medium">Name</th>
							<th className="px-4 py-3 font-medium">Slug</th>
							<th className="px-4 py-3 font-medium">Capacities</th>
							<th className="px-4 py-3 font-medium">Status</th>
							<th className="px-4 py-3"></th>
						</tr>
					</thead>
					<tbody>
						{rooms.length === 0 && (
							<tr>
								<td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
									No rooms yet. Create your first one.
								</td>
							</tr>
						)}

						{publicRooms.length > 0 && (
							<>
								<GroupHeader label="Public rooms" count={publicRooms.length} />
								{publicRooms.map((r) => (
									<RoomRow key={r.id} room={r} />
								))}
							</>
						)}

						{privateRooms.length > 0 && (
							<>
								<GroupHeader label="Non-public rooms" count={privateRooms.length} />
								{privateRooms.map((r) => (
									<RoomRow key={r.id} room={r} />
								))}
							</>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function GroupHeader({ label, count }) {
	return (
		<tr className="bg-muted/40 border-y border-foreground/10">
			<td
				colSpan={5}
				className="px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
			>
				{label} · {count}
			</td>
		</tr>
	);
}

function RoomRow({ room }) {
	return (
		<tr className="border-b last:border-b-0 text-sm">
			<td className="px-4 py-3 font-medium">{room.name}</td>
			<td className="px-4 py-3 text-muted-foreground font-mono text-xs">
				{room.slug}
			</td>
			<td className="px-4 py-3 text-muted-foreground">
				{room.capacities?.length
					? room.capacities.map((c) => `${c.label} ${c.value}`).join(" · ")
					: "-"}
			</td>
			<td className="px-4 py-3">
				{room.is_published ? (
					<Badge>Published</Badge>
				) : (
					<Badge variant="secondary">Draft</Badge>
				)}
			</td>
			<td className="px-4 py-3 text-right">
				<Button asChild variant="ghost" size="sm">
					<Link href={`/admin/rooms/${room.id}`}>Edit</Link>
				</Button>
			</td>
		</tr>
	);
}
