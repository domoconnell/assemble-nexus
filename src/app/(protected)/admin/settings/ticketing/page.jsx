import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getTicketingSettings } from "@/db/queries/settings";
import TicketingEditor from "./_components/ticketing-editor";

export const dynamic = "force-dynamic";

export default async function TicketingSettingsPage() {
	const venue = await requireCurrentVenue();
	const ticketing = await getTicketingSettings(venue.id);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-10">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Platform fees</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Per-ticket platform fees charged on top of ticket prices for events ticketed
					through The Assembly Rooms. Per-room setup fees are set on the room&apos;s
					Details tab.
				</p>
			</div>

			<TicketingEditor initial={ticketing} />
		</div>
	);
}
