import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs";
import { listBookingsForAdmin } from "@/db/queries/bookings";
import { requireCurrentVenue } from "@/db/queries/venue";

export const dynamic = "force-dynamic";

const TABS = [
	{ key: "all", label: "All" },
	{ key: "pending", label: "Pending" },
	{ key: "upcoming", label: "Upcoming" },
	{ key: "past", label: "Past" },
];

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

function statusClass(status) {
	switch (status) {
		case "pending":
			return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
		case "approved":
		case "confirmed":
			return "border-primary/30 bg-primary/10 text-primary";
		case "rejected":
		case "cancelled":
			return "border-destructive/30 bg-destructive/10 text-destructive";
		case "completed":
			return "border-foreground/15 bg-muted text-muted-foreground";
		default:
			return "border-foreground/15 bg-muted text-muted-foreground";
	}
}

export default async function AdminBookingsPage({ searchParams }) {
	const sp = await searchParams;
	const tab = TABS.find((t) => t.key === sp?.tab)?.key ?? "all";
	const venue = await requireCurrentVenue();
	const rows = await listBookingsForAdmin(venue.id, { tab });

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-6xl space-y-6">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div>
					<h1 className="text-2xl font-semibold">Bookings</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Customer enquiries and approved bookings.
					</p>
				</div>
				<Link
					href="/admin/bookings/new"
					className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90"
				>
					+ New booking
				</Link>
			</div>

			<Tabs value={tab}>
				<TabsList>
					{TABS.map((t) => (
						<TabsTrigger key={t.key} value={t.key} asChild>
							<Link href={`/admin/bookings?tab=${t.key}`}>{t.label}</Link>
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<div className="rounded-lg border bg-card overflow-hidden">
				{rows.length === 0 ? (
					<p className="p-6 text-sm text-muted-foreground">Nothing to show.</p>
				) : (
					<table className="w-full text-sm">
						<thead className="bg-muted/40 text-xs uppercase tracking-[0.18em] text-muted-foreground">
							<tr>
								<th className="text-left font-normal px-4 py-3">Reference</th>
								<th className="text-left font-normal px-4 py-3">Customer</th>
								<th className="text-left font-normal px-4 py-3">Submitted</th>
								<th className="text-right font-normal px-4 py-3">Total</th>
								<th className="text-left font-normal px-4 py-3">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-foreground/10">
							{rows.map((r) => (
								<tr key={r.id} className="hover:bg-muted/30">
									<td className="px-4 py-3">
										<Link
											href={`/admin/bookings/${r.id}`}
											className="font-mono text-xs hover:underline"
										>
											{r.reference}
										</Link>
									</td>
									<td className="px-4 py-3">
										<div>
											{r.customer_first_name} {r.customer_last_name}
											{r.customer_organisation && (
												<span className="text-muted-foreground">
													{" "}· {r.customer_organisation}
												</span>
											)}
										</div>
										<div className="text-xs text-muted-foreground">{r.customer_email}</div>
									</td>
									<td className="px-4 py-3 text-muted-foreground">
										{r.submitted_at ? dateFmt.format(new Date(r.submitted_at)) : "-"}
									</td>
									<td className="px-4 py-3 text-right font-mono">
										{formatGbp(r.total_cents)}
									</td>
									<td className="px-4 py-3">
										<span
											className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${statusClass(r.status)}`}
										>
											{r.status}
										</span>
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
