import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getStarlingSettings } from "@/db/queries/settings";
import StarlingEditor from "./_components/starling-editor";

export const dynamic = "force-dynamic";

export default async function BankAccountSettingsPage() {
	const venue = await requireCurrentVenue();
	const starling = await getStarlingSettings(venue.id);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-8">
			<div>
				<Link
					href="/admin/settings"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Bank account</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Connect the venue&apos;s Starling Bank account so the cleared balance
					appears on the ledger dashboard. Read-only — Nexus never moves money.
				</p>
			</div>

			<StarlingEditor initial={starling} />
		</div>
	);
}
