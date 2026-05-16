import { requireCurrentVenue } from "@/db/queries/venue";
import {
	getMonthlyPnl,
	expensesByCategoryForMonth,
	listManualIncomeForMonth,
} from "@/db/queries/finance";
import {
	currentMonthLondon,
	resolveMonth,
	monthLabel,
} from "@/lib/finance/months";
import BoardPackPrintBar from "./print-bar";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const VENUE_NAME = "The Assembly Rooms";

export async function generateMetadata({ searchParams }) {
	const sp = await searchParams;
	const ym = typeof sp?.month === "string" ? sp.month : currentMonthLondon().ym;
	return {
		title: `Director board pack · ${ym} - ${VENUE_NAME}`,
		robots: { index: false, follow: false },
	};
}

export default async function BoardPackPage({ searchParams }) {
	const venue = await requireCurrentVenue();
	const sp = await searchParams;
	const requested = typeof sp?.month === "string" ? sp.month : null;
	const fallback = currentMonthLondon();
	const ym = /^\d{4}-\d{2}$/.test(requested ?? "") ? requested : fallback.ym;
	const month = resolveMonth(ym);

	const [pnl, byCategory, manualIncome] = await Promise.all([
		getMonthlyPnl(venue.id, {
			ymdFirstOfMonth: month.ymdFirstOfMonth,
			ymdFirstOfNextMonth: month.ymdFirstOfNextMonth,
			monthStartDate: month.monthStartDate,
			monthEndDate: month.monthEndDate,
		}),
		expensesByCategoryForMonth(venue.id, month.ymdFirstOfMonth, month.ymdFirstOfNextMonth),
		listManualIncomeForMonth(venue.id, month.ymdFirstOfMonth, month.ymdFirstOfNextMonth),
	]);

	const generatedAt = new Intl.DateTimeFormat("en-GB", {
		dateStyle: "long",
		timeStyle: "short",
		timeZone: "Europe/London",
	}).format(new Date());

	return (
		<>
			<style>{`
				@media print {
					.no-print { display: none !important; }
					body { background: white !important; }
					.board-pack { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
					@page { size: A4; margin: 18mm 14mm; }
				}
				.board-pack { color-adjust: exact; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
			`}</style>

			<BoardPackPrintBar ym={ym} monthLabel={monthLabel(month.year, month.month1)} />

			<div className="board-pack mx-auto p-8 lg:p-12 max-w-4xl bg-background text-foreground">
				<header className="space-y-3 border-b border-foreground/20 pb-6 mb-8">
					<div className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
						Director board pack
					</div>
					<h1 className="font-display text-4xl tracking-tight">
						{VENUE_NAME} - {monthLabel(month.year, month.month1)}
					</h1>
					<p className="text-sm text-muted-foreground">
						Monthly P&amp;L and ministry-gift calculation. Generated {generatedAt}.
					</p>
				</header>

				<section className="mb-10">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-3">
						Ministry gift available
					</h2>
					<div className={`font-display text-6xl tracking-tight ${pnl.ministry_gift < 0 ? "text-destructive" : "text-primary"}`}>
						{fmt(pnl.ministry_gift)}
					</div>
					<p className="text-sm text-muted-foreground mt-3 max-w-2xl">
						Surplus after the venue's cost of delivery, utilities, staff, mortgage, and
						any extra mortgage payments have been covered. This is the amount available
						to gift to the church for ministry this month.
					</p>
				</section>

				<section className="mb-10 grid gap-8 lg:grid-cols-2">
					<div className="space-y-3">
						<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							Income
						</h2>
						<dl className="space-y-1.5 text-sm">
							<Row label="Ticket sales" value={fmt(pnl.income.tickets)} />
							<Row label="Booking deposits + balances" value={fmt(pnl.income.bookings)} />
							<Row label="POS net" value={fmt(pnl.income.pos_net)} />
							<Row label="Manual income" value={fmt(pnl.income.manual)} />
							<Row label="Total" value={fmt(pnl.income.total)} bold border />
						</dl>
						{manualIncome.length > 0 && (
							<div className="pt-2">
								<div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
									Manual income detail
								</div>
								<ul className="space-y-0.5 text-xs text-foreground/80">
									{manualIncome.map((m) => (
										<li key={m.id} className="flex items-baseline justify-between gap-3">
											<span>
												{m.description}{" "}
												<span className="text-muted-foreground">({m.kind})</span>
											</span>
											<span className="font-mono">{fmt(m.amount_cents)}</span>
										</li>
									))}
								</ul>
							</div>
						)}
					</div>

					<div className="space-y-3">
						<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							Fixed monthly costs
						</h2>
						<dl className="space-y-1.5 text-sm">
							<Row label="Utilities" value={fmt(pnl.fixed.utilities)} />
							<Row label="Staff" value={fmt(pnl.fixed.staff)} />
							<Row label="Mortgage" value={fmt(pnl.fixed.mortgage)} />
							<Row label="Extra mortgage" value={fmt(pnl.fixed.mortgage_extra)} />
							<Row label="Total" value={fmt(pnl.fixed_total)} bold border />
						</dl>
					</div>
				</section>

				<section className="mb-10">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-3">
						Cost of delivery
					</h2>
					{byCategory.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No operational expenses recorded this month.
						</p>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-foreground/15 text-left">
									<th className="py-2 font-normal text-xs uppercase tracking-[0.18em] text-muted-foreground">
										Category
									</th>
									<th className="py-2 font-normal text-xs uppercase tracking-[0.18em] text-muted-foreground text-right">
										Count
									</th>
									<th className="py-2 font-normal text-xs uppercase tracking-[0.18em] text-muted-foreground text-right">
										Total
									</th>
								</tr>
							</thead>
							<tbody>
								{byCategory.map((row) => (
									<tr key={row.name} className="border-b border-foreground/5">
										<td className="py-1.5">
											{row.name}
											{!row.is_cost_of_delivery && (
												<span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
													(off-formula)
												</span>
											)}
										</td>
										<td className="py-1.5 text-right text-muted-foreground">{row.count}</td>
										<td className="py-1.5 text-right font-mono">{fmt(row.total)}</td>
									</tr>
								))}
								<tr>
									<td className="pt-3 font-medium">Operational expenses</td>
									<td />
									<td className="pt-3 text-right font-mono font-medium">
										{fmt(pnl.expenses_delivery)}
									</td>
								</tr>
								{pnl.pos_cogs > 0 && (
									<tr>
										<td className="pt-1">POS cost of goods</td>
										<td />
										<td className="pt-1 text-right font-mono">{fmt(pnl.pos_cogs)}</td>
									</tr>
								)}
								<tr className="border-t border-foreground/20">
									<td className="pt-2 font-medium">Total cost of delivery</td>
									<td />
									<td className="pt-2 text-right font-mono font-medium">
										{fmt(pnl.cost_of_delivery)}
									</td>
								</tr>
							</tbody>
						</table>
					)}
				</section>

				<section className="rounded-lg border border-primary/30 bg-primary/5 p-6">
					<h2 className="text-xs uppercase tracking-[0.22em] text-primary mb-3">
						Ministry-gift calculation
					</h2>
					<dl className="space-y-1.5 text-sm">
						<Row label="Total income" value={fmt(pnl.income.total)} />
						<Row label="− Cost of delivery" value={`− ${fmt(pnl.cost_of_delivery)}`} muted />
						<Row label="− Utilities" value={`− ${fmt(pnl.fixed.utilities)}`} muted />
						<Row label="− Staff" value={`− ${fmt(pnl.fixed.staff)}`} muted />
						<Row label="− Mortgage" value={`− ${fmt(pnl.fixed.mortgage)}`} muted />
						<Row label="− Extra mortgage" value={`− ${fmt(pnl.fixed.mortgage_extra)}`} muted />
						<Row
							label="Ministry gift available"
							value={fmt(pnl.ministry_gift)}
							bold
							border
						/>
					</dl>
				</section>

				<footer className="mt-12 pt-4 border-t border-foreground/10 text-xs text-muted-foreground">
					Generated by Nexus · {VENUE_NAME} · {generatedAt}
				</footer>
			</div>
		</>
	);
}

function Row({ label, value, muted, bold, border }) {
	return (
		<div
			className={`flex items-baseline justify-between gap-3 ${border ? "border-t border-foreground/20 pt-2 mt-1" : ""}`}
		>
			<dt className={`${muted ? "text-muted-foreground" : ""} ${bold ? "font-medium" : ""}`}>
				{label}
			</dt>
			<dd className={`font-mono ${bold ? "font-medium" : ""}`}>{value}</dd>
		</div>
	);
}
