import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getMonthlyPnl } from "@/db/queries/finance";
import {
	currentMonthLondon,
	resolveMonth,
	nextMonth,
	prevMonth,
	monthLabel,
} from "@/lib/finance/months";
import { getCombinedLatestBalance } from "@/db/queries/bank";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

function pad(n) {
	return String(n).padStart(2, "0");
}

export default async function LedgerDashboardPage({ searchParams }) {
	const venue = await requireCurrentVenue();

	const sp = await searchParams;
	const requested = typeof sp?.month === "string" ? sp.month : null;
	const fallback = currentMonthLondon();
	const ym = /^\d{4}-\d{2}$/.test(requested ?? "") ? requested : fallback.ym;

	const month = resolveMonth(ym);
	const [pnl, bank] = await Promise.all([
		getMonthlyPnl(venue.id, {
			ymdFirstOfMonth: month.ymdFirstOfMonth,
			ymdFirstOfNextMonth: month.ymdFirstOfNextMonth,
			monthStartDate: month.monthStartDate,
			monthEndDate: month.monthEndDate,
		}),
		getCombinedLatestBalance(venue.id),
	]);

	const prev = prevMonth(month.year, month.month1);
	const next = nextMonth(month.year, month.month1);
	const prevYm = `${prev.year}-${pad(prev.month1)}`;
	const nextYm = `${next.year}-${pad(next.month1)}`;
	const isCurrent = ym === fallback.ym;

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div className="flex items-baseline justify-between gap-4 flex-wrap">
				<div>
					<h1 className="text-2xl font-semibold">Ledger — {monthLabel(month.year, month.month1)}</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Monthly P&amp;L for The Assembly Rooms.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Link
						href={`/admin/ledger/overview?month=${prevYm}`}
						className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
					>
						← {monthLabel(prev.year, prev.month1)}
					</Link>
					{!isCurrent && (
						<Link
							href="/admin/ledger/overview"
							className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
						>
							This month
						</Link>
					)}
					<Link
						href={`/admin/ledger/overview?month=${nextYm}`}
						className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
					>
						{monthLabel(next.year, next.month1)} →
					</Link>
					<Link
						href={`/admin/ledger/board-pack?month=${ym}`}
						target="_blank"
						className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm text-primary hover:bg-primary/10"
					>
						Board pack →
					</Link>
				</div>
			</div>

			{bank && (
				<Link
					href="/admin/ledger/banking"
					className="rounded-lg border bg-card p-4 flex items-baseline justify-between gap-3 hover:border-foreground/30 transition"
				>
					<div>
						<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
							Bank balance · {bank.account_count} account{bank.account_count === 1 ? "" : "s"}
						</div>
						<div className="font-display text-xl mt-1">{fmt(bank.cleared_minor)}</div>
					</div>
					<div className="text-right text-xs text-muted-foreground">
						{bank.pending_minor !== 0 && <div>Pending: {fmt(bank.pending_minor)}</div>}
						<div>Effective: {fmt(bank.effective_minor)}</div>
					</div>
				</Link>
			)}

			<section className="rounded-lg border border-primary/30 bg-primary/5 p-6 space-y-4">
				<div className="text-xs uppercase tracking-[0.22em] text-primary">
					Ministry gift available
				</div>
				<div className={`font-display text-5xl tracking-tight ${pnl.ministry_gift < 0 ? "text-destructive" : ""}`}>
					{fmt(pnl.ministry_gift)}
				</div>
				<dl className="space-y-1.5 text-sm pt-3 border-t border-foreground/10">
					<Row label="Total income" value={fmt(pnl.income.total)} />
					<Row label="− Cost of delivery" value={`− ${fmt(pnl.cost_of_delivery)}`} muted />
					<Row label="− Utilities" value={`− ${fmt(pnl.fixed.utilities)}`} muted />
					<Row label="− Staff" value={`− ${fmt(pnl.fixed.staff)}`} muted />
					<Row label="− Mortgage" value={`− ${fmt(pnl.fixed.mortgage)}`} muted />
					<Row label="− Extra mortgage" value={`− ${fmt(pnl.fixed.mortgage_extra)}`} muted />
				</dl>
			</section>

			<div className="grid gap-4 lg:grid-cols-2">
				<section className="rounded-lg border bg-card p-6 space-y-3">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Income
					</h2>
					<dl className="space-y-1.5 text-sm">
						<Row label="Tickets (paid orders)" value={fmt(pnl.income.tickets)} />
						<Row label="Bookings (deposits collected)" value={fmt(pnl.income.bookings)} />
						<Row label="POS (net)" value={fmt(pnl.income.pos_net)} />
						<Row label="Manual income" value={fmt(pnl.income.manual)} />
						<div className="border-t border-foreground/10 mt-2 pt-2">
							<Row label="Total" value={fmt(pnl.income.total)} bold />
						</div>
					</dl>
				</section>

				<section className="rounded-lg border bg-card p-6 space-y-3">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Costs
					</h2>
					<dl className="space-y-1.5 text-sm">
						<div>
							<div className="text-xs text-muted-foreground mb-1">Cost of delivery</div>
							<Row label="Operational expenses" value={fmt(pnl.expenses_delivery)} sub />
							<Row label="POS cost of goods" value={fmt(pnl.pos_cogs)} sub />
						</div>
						<div className="pt-2 border-t border-foreground/10">
							<div className="text-xs text-muted-foreground mb-1">Fixed monthly</div>
							<Row label="Utilities" value={fmt(pnl.fixed.utilities)} sub />
							<Row label="Staff" value={fmt(pnl.fixed.staff)} sub />
							<Row label="Mortgage" value={fmt(pnl.fixed.mortgage)} sub />
							<Row label="Extra mortgage" value={fmt(pnl.fixed.mortgage_extra)} sub />
						</div>
						<div className="border-t border-foreground/10 mt-2 pt-2">
							<Row
								label="Total"
								value={fmt(pnl.cost_of_delivery + pnl.fixed_total)}
								bold
							/>
						</div>
					</dl>
				</section>
			</div>

			<section className="rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground space-y-2">
				<div className="font-medium text-foreground">Manage source data</div>
				<ul className="list-disc pl-5 space-y-0.5">
					<li>
						<Link href="/admin/ledger/recurring" className="underline hover:text-foreground">
							Recurring costs
						</Link>{" "}
						— utilities, staff, mortgage figures
					</li>
					<li>
						<Link href="/admin/ledger/expenses" className="underline hover:text-foreground">
							Expenses
						</Link>{" "}
						— operational costs
					</li>
					<li>
						<Link href="/admin/ledger/pos" className="underline hover:text-foreground">
							POS takings
						</Link>{" "}
						— Square API sync (needs credentials)
					</li>
					<li>
						<Link href="/admin/ledger/income" className="underline hover:text-foreground">
							Manual income
						</Link>{" "}
						— donations and ad-hoc receipts
					</li>
				</ul>
			</section>
		</div>
	);
}

function Row({ label, value, muted, sub, bold }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt
				className={
					sub
						? "text-muted-foreground"
						: muted
							? "text-muted-foreground"
							: bold
								? "font-medium"
								: ""
				}
			>
				{label}
			</dt>
			<dd className={`font-mono ${bold ? "font-medium" : ""}`}>{value}</dd>
		</div>
	);
}
