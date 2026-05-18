import Link from "next/link";
import { listRoomsForAdmin } from "@/db/queries/rooms";
import { requireCurrentVenue } from "@/db/queries/venue";
import ChurchEventForm from "../_components/church-event-form";

export const dynamic = "force-dynamic";

export default async function NewChurchEventPage() {
	const venue = await requireCurrentVenue();
	const rooms = await listRoomsForAdmin(venue.id);
	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-6">
			<div>
				<Link href="/admin/church-events" className="text-sm text-muted-foreground hover:text-foreground">
					← Church events
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">New church event</h1>
			</div>
			<ChurchEventForm rooms={rooms} />
		</div>
	);
}
