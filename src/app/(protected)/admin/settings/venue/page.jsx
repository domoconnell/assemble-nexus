import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import VenueProfileEditor from "./_components/venue-profile-editor";

export const dynamic = "force-dynamic";

export default async function VenueSettingsPage() {
	const venue = await requireCurrentVenue();

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-8">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Venue profile</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Identity for this venue. Changes here flow into emails, the board pack
					PDF header, and any other surface that displays the venue&apos;s name.
				</p>
			</div>
			<VenueProfileEditor initial={venue} />
		</div>
	);
}
