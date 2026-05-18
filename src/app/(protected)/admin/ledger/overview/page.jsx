import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import {
	getMonthlyPnl,
	getAvailableToTransferToChurch,
	listMonthlyPnlForRange,
} from "@/db/queries/finance";
import { sumPaymentsOwedSplit } from "@/db/queries/bookings";
import {
	currentMonthLondon,
	resolveMonth,
	nextMonth,
	prevMonth,
	monthLabel,
} from "@/lib/finance/months";
import {
	getCombinedLatestBalance,
	listBankBalanceSeries,
	listRecentChurchTransfers,
} from "@/db/queries/bank";
import BalanceChart from "../banking/_components/balance-chart";
import PnlTrendChart from "../../_components/pnl-trend-chart";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});

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
	const [
		pnl,
		bank,
		daily,
		weekly,
		monthly,
		churchAvailable,
		recentTransfers,
		paymentsOwed,
		monthlyTrend,
	] = await Promise.all([
		getMonthlyPnl(venue.id, {
			ymdFirstOfMonth: month.ymdFirstOfMonth,
			ymdFirstOfNextMonth: month.ymdFirstOfNextMonth,
			monthStartDate: month.monthStartDate,
			monthEndDate: month.monthEndDate,
		}),
		getCombinedLatestBalance(venue.id),
		listBankBalanceSeries(venue.id, { bucket: "day" }),
		listBankBalanceSeries(venue.id, { bucket: "week" }),
		listBankBalanceSeries(venue.id, { bucket: "month" }),
		getAvailableToTransferToChurch(venue.id, { upToYm: ym }),
		listRecentChurchTransfers(venue.id, { limit: 5 }),
		sumPaymentsOwedSplit(venue.id, month.monthStartDate, month.monthEndDate),
		listMonthlyPnlForRange(venue.id, { endYm: ym, monthsBack: 12 }),
	]);

	const prev = prevMonth(month.year, month.month1);
	const next = nextMonth(month.year, month.month1);
	const prevYm = `${prev.year}-${pad(prev.month1)}`;
	const nextYm = `${next.year}-${pad(next.month1)}`;
	const isCurrent = ym === fallback.ym;

	const balanceSeries = { day: daily, week: weekly, month: monthly };
	const hasBalanceData = daily.length > 0 || weekly.length > 0 || monthly.length > 0;

	const flowRows = [
		{ kind: "value", label: "Income", value: pnl.income.total },
		{ kind: "deduction", label: "Cost of business", value: pnl.cost_of_business },
		{ kind: "subtotal", label: "Business Net", value: pnl.business_net },
		{ kind: "deduction", label: "Cost of building", value: pnl.cost_of_building },
		{
			kind: "subtotal",
			label: "Building Net",
			value: pnl.building_net,
			sub: "Transferable to the church",
			highlight: true,
		},
		{ kind: "deduction", label: "Extra mortgage", value: pnl.fixed.mortgage_extra },
		{ kind: "subtotal", label: "Ministry Net", value: pnl.ministry_net, highlight: true },
	];

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div className="flex items-baseline justify-between gap-4 flex-wrap">
				<div>
					<h1 className="text-2xl font-semibold">Ledger - {monthLabel(month.year, month.month1)}</h1>
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

			<section className="rounded-xl border bg-card p-6">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-4">
					Money flow this month
				</h2>
				<dl className="space-y-1.5 text-sm">
					{flowRows.map((r) => (
						<FlowRow key={r.label} row={r} />
					))}
				</dl>
			</section>

			<section className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-4">
				<div className="flex items-baseline justify-between gap-3 flex-wrap">
					<div>
						<div className="text-xs uppercase tracking-[0.22em] text-primary">
							Actual transfer to church
						</div>
						<div
							className={`font-display text-4xl tracking-tight mt-2 ${
								churchAvailable.available_to_transfer < 0 ? "text-destructive" : ""
							}`}
						>
							{fmt(churchAvailable.available_to_transfer)}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Historic sum of every month&apos;s Building Net minus every church
							transfer settled to date
							{churchAvailable.month_count > 0
								? ` · ${churchAvailable.month_count} month${churchAvailable.month_count === 1 ? "" : "s"} of P&L tracked so far.`
								: "."}
						</p>
					</div>
					<div className="text-right text-sm space-y-1">
						<div className="text-muted-foreground">
							Cumulative Building Net{" "}
							<span className="font-mono">{fmt(churchAvailable.cumulative_available)}</span>
						</div>
						<div className="text-muted-foreground">
							Transferred to date{" "}
							<span className="font-mono">−{fmt(churchAvailable.transferred_to_church)}</span>
						</div>
					</div>
				</div>
				{recentTransfers.length > 0 && (
					<div className="pt-3 border-t border-foreground/10">
						<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
							Recent church transfers
						</div>
						<ul className="space-y-1 text-sm">
							{recentTransfers.map((t) => (
								<li
									key={t.id}
									className="flex items-baseline justify-between gap-3 text-foreground/85"
								>
									<span className="truncate">
										{t.counterparty_name || t.reference || "Church transfer"}
										<span className="text-xs text-muted-foreground ml-2">
											{t.settled_at
												? dateFmt.format(new Date(t.settled_at))
												: t.transaction_time
													? dateFmt.format(new Date(t.transaction_time))
													: ""}
										</span>
									</span>
									<span className="font-mono shrink-0">{fmt(t.amount_minor)}</span>
								</li>
							))}
						</ul>
						<div className="pt-2 text-right">
							<Link
								href="/admin/ledger/banking"
								className="text-xs text-muted-foreground hover:text-foreground"
							>
								All transactions →
							</Link>
						</div>
					</div>
				)}
			</section>

			<PaymentsOwedSection paymentsOwed={paymentsOwed} />

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

			{hasBalanceData && (
				<section className="rounded-lg border bg-card p-6">
					<BalanceChart series={balanceSeries} defaultBucket="week" />
				</section>
			)}

			<section className="rounded-lg border bg-card p-6 space-y-4">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Income vs costs · last 12 months
				</h2>
				<PnlTrendChart months={monthlyTrend} />
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
							<div className="text-xs text-muted-foreground mb-1">
								Cost of business
							</div>
							<Row label="Cost of delivery" value={fmt(pnl.cost_of_delivery)} sub />
							<Row label="Staff" value={fmt(pnl.fixed.staff)} sub />
							<Row label="Total" value={fmt(pnl.cost_of_business)} bold />
						</div>
						<div className="pt-3 border-t border-foreground/10">
							<div className="text-xs text-muted-foreground mb-1">
								Cost of building (paid by church)
							</div>
							<Row label="Utilities" value={fmt(pnl.fixed.utilities)} sub />
							<Row label="Mortgage" value={fmt(pnl.fixed.mortgage)} sub />
							<Row label="Total" value={fmt(pnl.cost_of_building)} bold />
						</div>
						<div className="pt-3 border-t border-foreground/10">
							<Row label="Extra mortgage (held by church)" value={fmt(pnl.fixed.mortgage_extra)} sub />
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
						- utilities, staff, mortgage figures
					</li>
					<li>
						<Link href="/admin/ledger/expenses" className="underline hover:text-foreground">
							Expenses
						</Link>{" "}
						- operational costs
					</li>
					<li>
						<Link href="/admin/ledger/pos" className="underline hover:text-foreground">
							POS takings
						</Link>{" "}
						- Square API sync (needs credentials)
					</li>
					<li>
						<Link href="/admin/ledger/income" className="underline hover:text-foreground">
							Manual income
						</Link>{" "}
						- donations and ad-hoc receipts
					</li>
					<li>
						<Link
							href="/admin/settings/church-transfer"
							className="underline hover:text-foreground"
						>
							Church transfer settings
						</Link>{" "}
						- counterparty match for auto-tagging church transfers
					</li>
				</ul>
			</section>
		</div>
	);
}

function PaymentsOwedSection({ paymentsOwed }) {
	const thisMonthTotal = paymentsOwed.this_month.total;
	const previousTotal = paymentsOwed.previous.total;
	const grandTotal = thisMonthTotal + previousTotal;
	return (
		<section className="rounded-lg border bg-card p-6 space-y-4">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Payments owed
				</h2>
				<div className="font-display text-xl">{fmt(grandTotal)}</div>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<PaymentsOwedColumn
					title="From events this month"
					bucket={paymentsOwed.this_month}
				/>
				<PaymentsOwedColumn
					title="From previous events"
					bucket={paymentsOwed.previous}
				/>
			</div>
		</section>
	);
}

function PaymentsOwedColumn({ title, bucket }) {
	return (
		<div className="rounded-md border border-foreground/10 bg-background p-4 space-y-2">
			<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
				{title}
			</div>
			<dl className="space-y-1 text-sm">
				<div className="flex items-baseline justify-between gap-3 text-foreground/85">
					<dt>Unpaid deposits</dt>
					<dd className="font-mono">{fmt(bucket.unpaid_deposits)}</dd>
				</div>
				<div className="flex items-baseline justify-between gap-3 text-foreground/85">
					<dt>Final payments</dt>
					<dd className="font-mono">{fmt(bucket.unpaid_balances)}</dd>
				</div>
				<div className="flex items-baseline justify-between gap-3 border-t border-foreground/10 pt-1.5 mt-1 font-medium">
					<dt>Total</dt>
					<dd className="font-mono">{fmt(bucket.total)}</dd>
				</div>
			</dl>
		</div>
	);
}

function FlowRow({ row }) {
	if (row.kind === "deduction") {
		return (
			<div className="flex items-baseline justify-between gap-3 text-muted-foreground">
				<dt>− {row.label}</dt>
				<dd className="font-mono">− {fmt(row.value)}</dd>
			</div>
		);
	}
	if (row.kind === "subtotal") {
		const negative = row.value < 0;
		const toneClass = row.highlight
			? negative
				? "text-destructive"
				: "text-primary"
			: "";
		return (
			<div
				className={`flex items-baseline justify-between gap-3 border-t border-foreground/15 pt-2 mt-1 ${
					row.highlight ? "font-medium" : ""
				}`}
			>
				<dt className={toneClass}>
					{row.label}
					{row.sub && (
						<span className="ml-2 text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-normal">
							{row.sub}
						</span>
					)}
				</dt>
				<dd className={`font-mono ${toneClass}`}>{fmt(row.value)}</dd>
			</div>
		);
	}
	return (
		<div className="flex items-baseline justify-between gap-3 font-medium">
			<dt>{row.label}</dt>
			<dd className="font-mono">{fmt(row.value)}</dd>
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
