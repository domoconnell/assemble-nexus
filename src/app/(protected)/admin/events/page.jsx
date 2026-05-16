import Link from "next/link";
import { Button } from "@/shadcn/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs";
import { listEventsForAdmin } from "@/db/queries/events";
import { requireCurrentVenue } from "@/db/queries/venue";

export const dynamic = "force-dynamic";

const TABS = [
	{ key: "active", label: "Active" },
	{ key: "pending_review", label: "Pending review" },
	{ key: "past", label: "Past" },
];

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

function statusClass(status) {
	switch (status) {
		case "draft":
			return "border-foreground/15 bg-muted text-muted-foreground";
		case "pending_review":
			return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
		case "published":
			return "border-primary/30 bg-primary/10 text-primary";
		case "cancelled":
			return "border-destructive/30 bg-destructive/10 text-destructive";
		case "past":
			return "border-foreground/15 bg-muted text-muted-foreground";
		default:
			return "border-foreground/15 bg-muted text-muted-foreground";
	}
}

export default async function AdminEventsPage({ searchParams }) {
	const sp = await searchParams;
	const tab = TABS.find((t) => t.key === sp?.tab)?.key ?? "active";
	const venue = await requireCurrentVenue();
	const rows = await listEventsForAdmin(venue.id, { tab });

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-6xl space-y-6">
			<div className="flex items-start justify-between gap-4 flex-wrap">
				<div>
					<h1 className="text-2xl font-semibold">Events</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Public-facing events at the venue, ticketed or not.
					</p>
				</div>
				<Button asChild>
					<Link href="/admin/events/new">+ New event</Link>
				</Button>
			</div>

			<Tabs value={tab}>
				<TabsList>
					{TABS.map((t) => (
						<TabsTrigger key={t.key} value={t.key} asChild>
							<Link href={`/admin/events?tab=${t.key}`}>{t.label}</Link>
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<div className="rounded-lg border bg-card overflow-hidden">
				{rows.length === 0 ? (
					<p className="p-6 text-sm text-muted-foreground">Nothing here yet.</p>
				) : (
					<table className="w-full text-sm">
						<thead className="bg-muted/40 text-xs uppercase tracking-[0.18em] text-muted-foreground">
							<tr>
								<th className="text-left font-normal px-4 py-3">Event</th>
								<th className="text-left font-normal px-4 py-3">When</th>
								<th className="text-left font-normal px-4 py-3">Status</th>
								<th className="text-left font-normal px-4 py-3">Visibility</th>
								<th className="text-left font-normal px-4 py-3">Ticketing</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-foreground/10">
							{rows.map((r) => (
								<tr key={r.id} className="hover:bg-muted/30">
									<td className="px-4 py-3">
										<Link
											href={`/admin/events/${r.id}`}
											className="font-medium hover:underline"
										>
											{r.title}
										</Link>
										{r.summary && (
											<div className="text-xs text-muted-foreground line-clamp-1">
												{r.summary}
											</div>
										)}
									</td>
									<td className="px-4 py-3 text-muted-foreground">
										{r.starts_at ? dateFmt.format(new Date(r.starts_at)) : "-"}
									</td>
									<td className="px-4 py-3">
										<span
											className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${statusClass(r.status)}`}
										>
											{r.status}
										</span>
									</td>
									<td className="px-4 py-3 text-muted-foreground capitalize">
										{r.visibility}
									</td>
									<td className="px-4 py-3 text-muted-foreground">
										{r.is_ticketed ? "Yes" : "-"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
