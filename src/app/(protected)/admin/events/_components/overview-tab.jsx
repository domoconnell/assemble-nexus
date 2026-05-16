"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/shadcn/components/ui/chart";
import CheckinLinkCard from "./checkin-link-card";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

const dayShortFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	timeZone: "Europe/London",
});

const expenseDayFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	timeZone: "UTC",
});
function formatExpenseDate(ymd) {
	if (!ymd) return "-";
	const [y, m, d] = ymd.split("-").map(Number);
	return expenseDayFmt.format(new Date(Date.UTC(y, m - 1, d)));
}
const dayLongFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	timeZone: "Europe/London",
});
const ymdFmt = new Intl.DateTimeFormat("en-CA", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	timeZone: "Europe/London",
});

const DAY_WINDOW = 30;

function ymdKeyFor(date) {
	return ymdFmt.format(date);
}

function parseYmd(ymd) {
	const [y, m, d] = ymd.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function buildBuckets(orders) {
	const todayKey = ymdKeyFor(new Date());
	const todayUtc = parseYmd(todayKey);

	const buckets = [];
	for (let i = DAY_WINDOW - 1; i >= 0; i--) {
		const d = new Date(todayUtc);
		d.setUTCDate(d.getUTCDate() - i);
		const key = ymdKeyFor(d);
		buckets.push({
			key,
			date: d,
			label: dayShortFmt.format(d),
			longLabel: dayLongFmt.format(d),
			orders: 0,
			gross: 0,
		});
	}
	const indexByKey = new Map(buckets.map((b, i) => [b.key, i]));

	for (const o of orders) {
		if (o.status === "cancelled") continue;
		const at = o.paid_at ?? o.createdAt;
		if (!at) continue;
		const key = ymdKeyFor(new Date(at));
		const i = indexByKey.get(key);
		if (i == null) continue;
		buckets[i].orders += 1;
		buckets[i].gross += o.total_cents ?? 0;
	}
	return buckets;
}

const chartConfig = {
	orders: {
		label: "Orders",
		color: "var(--primary)",
	},
};

function bookingStatusClass(status) {
	switch (status) {
		case "pending":
			return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
		case "approved":
		case "confirmed":
		case "completed":
			return "border-primary/30 bg-primary/10 text-primary";
		case "rejected":
		case "cancelled":
			return "border-destructive/30 bg-destructive/10 text-destructive";
		default:
			return "border-foreground/15 bg-muted text-muted-foreground";
	}
}

export default function OverviewTab({
	orders = [],
	eventId,
	checkinCode,
	linkedExpenses = [],
	linkedBooking = null,
	linkedOrganisation = null,
}) {
	const paid = orders.filter(
		(o) => o.status === "paid" || o.status === "partially_refunded",
	);
	const refunded = orders.filter(
		(o) => o.status === "refunded" || o.status === "partially_refunded",
	);

	const gross = paid.reduce((s, o) => s + (o.total_cents ?? 0), 0);
	const fees = paid.reduce((s, o) => s + (o.booking_fee_cents ?? 0), 0);
	const net = paid.reduce((s, o) => {
		const orderValue = (o.subtotal_cents ?? 0) + (o.vat_cents ?? 0);
		const fee = o.booking_fee_borne_by === "organiser" ? (o.booking_fee_cents ?? 0) : 0;
		return s + orderValue - fee;
	}, 0);
	const delegates = paid.reduce((s, o) => s + (o.delegate_count ?? 0), 0);

	const linkedExpensesTotal = linkedExpenses.reduce((s, e) => s + (e.amount_cents ?? 0), 0);
	const eventProfit = gross - linkedExpensesTotal;

	const buckets = useMemo(() => buildBuckets(orders), [orders]);
	const hasActivity = buckets.some((b) => b.orders > 0);
	const peakOrders = Math.max(1, ...buckets.map((b) => b.orders));

	return (
		<div className="space-y-6">
			<section className="rounded-lg border bg-card p-6 space-y-3">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Who & where
				</h2>
				<div className="grid gap-4 sm:grid-cols-2 text-sm">
					<div>
						<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
							Organisation
						</div>
						<div className="mt-1">
							{linkedOrganisation ? (
								<Link
									href={`/admin/crm/${linkedOrganisation.id}`}
									className="font-medium hover:underline"
								>
									{linkedOrganisation.name}
								</Link>
							) : (
								<span className="font-medium">Internal - The Assembly Rooms</span>
							)}
						</div>
						{linkedOrganisation?.notes && (
							<div className="text-xs text-muted-foreground mt-1 line-clamp-2">
								{linkedOrganisation.notes}
							</div>
						)}
					</div>
					<div>
						<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
							Linked booking
						</div>
						<div className="mt-1">
							{linkedBooking ? (
								<div className="flex items-center gap-2 flex-wrap">
									<Link
										href={`/admin/bookings/${linkedBooking.id}`}
										className="font-mono font-medium hover:underline"
									>
										{linkedBooking.reference}
									</Link>
									<span
										className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${bookingStatusClass(linkedBooking.status)}`}
									>
										{linkedBooking.status}
									</span>
								</div>
							) : (
								<span className="text-muted-foreground italic">
									No booking - internal event
								</span>
							)}
						</div>
					</div>
				</div>
			</section>
			{eventId && (
				<CheckinLinkCard eventId={eventId} initialCheckinCode={checkinCode} />
			)}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard label="Orders (paid)" value={paid.length} />
				<KpiCard label="Delegates" value={delegates} />
				<KpiCard label="Gross" value={formatGbp(gross)} />
				<KpiCard label="Organiser net" value={formatGbp(net)} />
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<KpiCard label="Booking fees" value={formatGbp(fees)} hint="Across all paid orders." />
				<KpiCard
					label="Refunded orders"
					value={refunded.length}
					hint={refunded.length > 0 ? `${refunded.length} of ${orders.length}` : "No refunds yet."}
				/>
			</div>

			<section className="rounded-lg border bg-card p-6 space-y-4">
				<div className="flex items-baseline justify-between gap-3 flex-wrap gap-y-1">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Event profitability
					</h2>
					<span className="text-xs text-muted-foreground">
						{linkedExpenses.length === 0
							? "No expenses linked to this event yet."
							: `${linkedExpenses.length} linked ${linkedExpenses.length === 1 ? "expense" : "expenses"}`}
					</span>
				</div>
				<dl className="grid gap-2 text-sm sm:grid-cols-3">
					<div>
						<dt className="text-xs text-muted-foreground">Gross revenue</dt>
						<dd className="font-display text-xl mt-0.5">{formatGbp(gross)}</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">Linked expenses</dt>
						<dd className="font-display text-xl mt-0.5">{formatGbp(linkedExpensesTotal)}</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">Net profit</dt>
						<dd
							className={`font-display text-xl mt-0.5 ${eventProfit < 0 ? "text-destructive" : "text-primary"}`}
						>
							{formatGbp(eventProfit)}
						</dd>
					</div>
				</dl>
				{linkedExpenses.length > 0 && (
					<div className="border-t border-foreground/10 pt-3">
						<table className="w-full text-sm">
							<tbody>
								{linkedExpenses.map((e) => (
									<tr key={e.id} className="border-t border-foreground/5 first:border-t-0">
										<td className="py-1.5 whitespace-nowrap text-muted-foreground">
											{formatExpenseDate(e.date)}
										</td>
										<td className="py-1.5">{e.description}</td>
										<td className="py-1.5 text-muted-foreground">{e.category_name ?? "-"}</td>
										<td className="py-1.5 text-right font-mono whitespace-nowrap">
											{formatGbp(e.amount_cents)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<section className="rounded-lg border bg-card p-6 space-y-4">
				<div className="flex items-baseline justify-between gap-3">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Orders per day
					</h2>
					<div className="text-xs text-muted-foreground">Last {DAY_WINDOW} days</div>
				</div>
				{!hasActivity ? (
					<p className="text-sm text-muted-foreground">
						No orders in the last {DAY_WINDOW} days.
					</p>
				) : (
					<ChartContainer config={chartConfig} className="h-48 w-full">
						<BarChart
							data={buckets}
							margin={{ top: 8, right: 8, bottom: 8, left: -16 }}
						>
							<CartesianGrid vertical={false} stroke="var(--foreground)" strokeOpacity={0.08} />
							<XAxis
								dataKey="label"
								tickLine={false}
								axisLine={false}
								interval="preserveStartEnd"
								tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
								minTickGap={24}
							/>
							<YAxis
								allowDecimals={false}
								domain={[0, Math.max(2, peakOrders + 1)]}
								tickLine={false}
								axisLine={false}
								width={28}
								tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
							/>
							<ChartTooltip
								cursor={{ fill: "var(--foreground)", fillOpacity: 0.06 }}
								content={
									<ChartTooltipContent
										labelFormatter={(_, payload) => payload?.[0]?.payload?.longLabel ?? ""}
										formatter={(value, _name, item) => (
											<div className="flex items-baseline justify-between gap-3 w-full">
												<span className="text-muted-foreground">Orders</span>
												<span className="font-mono">
													{value}
													{item?.payload?.gross > 0 && (
														<span className="text-muted-foreground ml-2">
															· {formatGbp(item.payload.gross)}
														</span>
													)}
												</span>
											</div>
										)}
										hideIndicator
									/>
								}
							/>
							<Bar dataKey="orders" fill="var(--color-orders)" radius={[3, 3, 0, 0]} />
						</BarChart>
					</ChartContainer>
				)}
			</section>
		</div>
	);
}

function KpiCard({ label, value, hint }) {
	return (
		<div className="rounded-lg border bg-card p-4">
			<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
				{label}
			</div>
			<div className="mt-1 font-display text-2xl">{value}</div>
			{hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
		</div>
	);
}
