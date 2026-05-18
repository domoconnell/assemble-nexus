import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getChurchTransferSettings } from "@/db/queries/settings";
import ChurchTransferEditor from "./_components/church-transfer-editor";

export const dynamic = "force-dynamic";

export default async function ChurchTransferSettingsPage() {
	const venue = await requireCurrentVenue();
	const initial = await getChurchTransferSettings(venue.id);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-8">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Church transfers</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Identify the church's bank account so the bank sync can auto-tag
					outbound transfers. Any single non-empty field below is enough to
					match - the sync ORs them. You can also flip the flag manually on
					individual transactions.
				</p>
			</div>
			<ChurchTransferEditor initial={initial} />
		</div>
	);
}
