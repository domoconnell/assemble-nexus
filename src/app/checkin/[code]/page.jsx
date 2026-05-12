import { notFound } from "next/navigation";
import { getEventByCheckinCode, countEventTickets } from "@/db/queries/events";
import CheckinScanner from "./scanner";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
	const { code } = await params;
	const ev = await getEventByCheckinCode(code);
	return {
		title: ev ? `Check-in · ${ev.title}` : "Check-in",
		robots: { index: false, follow: false },
	};
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

export default async function CheckinPage({ params }) {
	const { code } = await params;
	const ev = await getEventByCheckinCode(code);
	if (!ev) notFound();

	const counts = await countEventTickets(ev.id);

	const startsLabel = ev.starts_at ? dateFmt.format(new Date(ev.starts_at)) : null;

	return (
		<div className="theme-site min-h-svh bg-background text-foreground">
			<CheckinScanner
				checkinCode={code}
				eventTitle={ev.title}
				startsLabel={startsLabel}
				initialUsed={counts.used}
				initialTotal={counts.total}
			/>
		</div>
	);
}
