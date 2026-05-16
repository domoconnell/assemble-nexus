import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getSquareSettings } from "@/db/queries/settings";
import SquareEditor from "./_components/square-editor";

export const dynamic = "force-dynamic";

export default async function PosSettingsPage() {
	const venue = await requireCurrentVenue();
	const square = await getSquareSettings(venue.id);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-8">
			<div>
				<Link
					href="/admin/settings"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">POS</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Connect the venue&apos;s point-of-sale so daily takings sync into the
					ledger. Read-only - Nexus never issues refunds or moves money on
					Square&apos;s side.
				</p>
			</div>

			<SquareEditor initial={square} />
		</div>
	);
}
