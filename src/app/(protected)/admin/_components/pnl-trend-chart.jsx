"use client";

import {
	Area,
	AreaChart,
	CartesianGrid,
	Line,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

const monthFmt = new Intl.DateTimeFormat("en-GB", {
	month: "short",
	year: "2-digit",
});

function monthLabel(ym) {
	const [y, m] = ym.split("-").map(Number);
	return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

export default function PnlTrendChart({ months }) {
	const data = months.map((m) => ({
		ym: m.ym,
		label: monthLabel(m.ym),
		// Trend chart uses the bank-actual cash-in number (same as
		// the headline waterfall + the banking page). Previously this
		// used `m.income.total` which is the per-entity paid_at view
		// — that diverges from the bank by 100s of £ due to PSP payout
		// lag, so the chart contradicted the headline for the same
		// month. Falling back to the entity total for historical months
		// that pre-date the cash_in_net column.
		income: m.cash_in_net ?? m.income.total,
		cost_of_delivery: m.cost_of_delivery,
		utilities_staff: m.fixed.utilities + m.fixed.staff,
		mortgage: m.fixed.mortgage,
		mortgage_extra: m.fixed.mortgage_extra,
	}));

	return (
		<div className="h-72 w-full">
			<ResponsiveContainer width="100%" height="100%">
				<AreaChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
					<defs>
						<linearGradient id="cod-fill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="oklch(0.6 0.18 30)" stopOpacity={0.5} />
							<stop offset="100%" stopColor="oklch(0.6 0.18 30)" stopOpacity={0.05} />
						</linearGradient>
						<linearGradient id="utilities-fill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="oklch(0.65 0.15 60)" stopOpacity={0.5} />
							<stop offset="100%" stopColor="oklch(0.65 0.15 60)" stopOpacity={0.05} />
						</linearGradient>
						<linearGradient id="mortgage-fill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="oklch(0.55 0.12 250)" stopOpacity={0.5} />
							<stop offset="100%" stopColor="oklch(0.55 0.12 250)" stopOpacity={0.05} />
						</linearGradient>
						<linearGradient id="mortgage-extra-fill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="oklch(0.5 0.12 290)" stopOpacity={0.5} />
							<stop offset="100%" stopColor="oklch(0.5 0.12 290)" stopOpacity={0.05} />
						</linearGradient>
					</defs>
					<CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
					<XAxis
						dataKey="label"
						tick={{ fontSize: 11 }}
						tickLine={false}
						axisLine={false}
					/>
					<YAxis
						tick={{ fontSize: 11 }}
						tickFormatter={(v) => `£${Math.round(v / 100)}`}
						tickLine={false}
						axisLine={false}
						width={60}
					/>
					<Tooltip
						content={<CustomTooltip />}
						cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
					/>
					<Area
						type="monotone"
						dataKey="cost_of_delivery"
						name="Cost of delivery"
						stackId="costs"
						stroke="oklch(0.6 0.18 30)"
						fill="url(#cod-fill)"
						strokeWidth={1.5}
					/>
					<Area
						type="monotone"
						dataKey="utilities_staff"
						name="Utilities & Staff"
						stackId="costs"
						stroke="oklch(0.65 0.15 60)"
						fill="url(#utilities-fill)"
						strokeWidth={1.5}
					/>
					<Area
						type="monotone"
						dataKey="mortgage"
						name="Mortgage"
						stackId="costs"
						stroke="oklch(0.55 0.12 250)"
						fill="url(#mortgage-fill)"
						strokeWidth={1.5}
					/>
					<Area
						type="monotone"
						dataKey="mortgage_extra"
						name="Extra mortgage"
						stackId="costs"
						stroke="oklch(0.5 0.12 290)"
						fill="url(#mortgage-extra-fill)"
						strokeWidth={1.5}
					/>
					<Line
						type="monotone"
						dataKey="income"
						name="Income"
						stroke="oklch(0.7 0.18 145)"
						strokeWidth={2.5}
						dot={{ r: 3, fill: "oklch(0.7 0.18 145)" }}
						activeDot={{ r: 5 }}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}

function CustomTooltip({ active, payload, label }) {
	if (!active || !payload?.length) return null;
	const ordered = [
		"income",
		"cost_of_delivery",
		"utilities_staff",
		"mortgage",
		"mortgage_extra",
	];
	const byKey = Object.fromEntries(payload.map((p) => [p.dataKey, p]));
	return (
		<div className="rounded-md border border-foreground/15 bg-popover px-3 py-2 text-xs shadow-md">
			<div className="font-medium mb-1.5">{label}</div>
			<ul className="space-y-0.5">
				{ordered.map((k) => {
					const item = byKey[k];
					if (!item) return null;
					return (
						<li key={k} className="flex items-baseline justify-between gap-4">
							<span className="flex items-center gap-1.5">
								<span
									className="inline-block size-2 rounded-sm"
									style={{ background: item.color || item.stroke }}
								/>
								<span className="text-muted-foreground">{item.name}</span>
							</span>
							<span className="font-mono tabular-nums">{formatGbp(item.value)}</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
