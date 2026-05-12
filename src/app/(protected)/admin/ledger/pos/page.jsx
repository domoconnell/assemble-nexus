import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { listPosTakingsForMonth } from "@/db/queries/finance";
import {
	currentMonthLondon,
	resolveMonth,
	monthLabel,
	prevMonth,
	nextMonth,
} from "@/lib/finance/months";
import { squareConfig } from "@/lib/finance/square";
import PosClient from "./client";

export const dynamic = "force-dynamic";

function pad(n) {
	return String(n).padStart(2, "0");
}

export default async function PosPage({ searchParams }) {
	const venue = await requireCurrentVenue();
	const sp = await searchParams;
	const requested = typeof sp?.month === "string" ? sp.month : null;
	const fallback = currentMonthLondon();
	const ym = /^\d{4}-\d{2}$/.test(requested ?? "") ? requested : fallback.ym;
	const month = resolveMonth(ym);

	const takings = await listPosTakingsForMonth(
		venue.id,
		month.ymdFirstOfMonth,
		month.ymdFirstOfNextMonth,
	);
	const cfg = squareConfig();

	const prev = prevMonth(month.year, month.month1);
	const next = nextMonth(month.year, month.month1);
	const prevYm = `${prev.year}-${pad(prev.month1)}`;
	const nextYm = `${next.year}-${pad(next.month1)}`;

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-6">
			<div className="flex items-baseline justify-between gap-4 flex-wrap">
				<div>
					<h1 className="text-2xl font-semibold">POS takings — {monthLabel(month.year, month.month1)}</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Daily totals synced from Square. Refunds net out of gross.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Link
						href={`/admin/ledger/pos?month=${prevYm}`}
						className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
					>
						←
					</Link>
					<Link
						href={`/admin/ledger/pos?month=${nextYm}`}
						className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
					>
						→
					</Link>
				</div>
			</div>

			<PosClient
				ym={ym}
				monthYear={month.year}
				monthMonth1={month.month1}
				takings={takings}
				squareConfigured={cfg.configured}
				squareEnv={cfg.env}
			/>

			{!cfg.configured && (
				<section className="rounded-lg border border-dashed bg-muted/30 p-6 text-sm space-y-2">
					<div className="font-medium">Square not connected</div>
					<p className="text-muted-foreground">
						Set these env vars and restart to enable sync:
					</p>
					<ul className="list-disc pl-5 text-muted-foreground space-y-0.5 font-mono text-xs">
						<li>SQUARE_ACCESS_TOKEN</li>
						<li>SQUARE_LOCATION_ID</li>
						<li>SQUARE_ENVIRONMENT (sandbox | production)</li>
						<li>POS_SYNC_TOKEN (optional, for cron-triggered sync)</li>
					</ul>
				</section>
			)}
		</div>
	);
}
