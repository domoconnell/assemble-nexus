import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getHourlyBands } from "@/db/queries/settings";
import HoursEditor from "./_components/hours-editor";

export const dynamic = "force-dynamic";

export default async function HoursSettingsPage() {
	const venue = await requireCurrentVenue();
	const stored = await getHourlyBands(venue.id);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Hours &amp; rate bands</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Operating hours run 07:00-24:00. Within that window you can set rate bands that modify the
					room&apos;s standard hourly rate (e.g. evening +20%, late night +30%).
				</p>
			</div>
			<HoursEditor initialBands={stored.bands} />
		</div>
	);
}
