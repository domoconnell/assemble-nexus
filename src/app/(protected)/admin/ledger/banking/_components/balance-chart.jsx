"use client";

import { useMemo, useState } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (minor) => gbp.format((minor ?? 0) / 100);

const BUCKETS = [
	{ key: "day", label: "Daily" },
	{ key: "week", label: "Weekly" },
	{ key: "month", label: "Monthly" },
];

const labelFmts = {
	day: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }),
	week: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }),
	month: new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }),
};

const tooltipFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

export default function BalanceChart({ series, defaultBucket = "day" }) {
	const [bucket, setBucket] = useState(defaultBucket);

	const data = useMemo(() => {
		const points = series[bucket] || [];
		return points.map((p) => {
			const d = new Date(p.bucket_start);
			return {
				timestamp: d.getTime(),
				label: labelFmts[bucket].format(d),
				tooltipLabel: tooltipFmt.format(d),
				cleared_minor: p.cleared_minor,
			};
		});
	}, [series, bucket]);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					Balance over time
				</h2>
				<div className="inline-flex rounded-md border border-foreground/10 bg-card p-0.5">
					{BUCKETS.map((b) => (
						<button
							key={b.key}
							type="button"
							onClick={() => setBucket(b.key)}
							className={`px-3 py-1 text-xs rounded transition ${
								bucket === b.key
									? "bg-primary/15 text-primary"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{b.label}
						</button>
					))}
				</div>
			</div>

			{data.length === 0 ? (
				<div className="rounded-xl border border-dashed border-foreground/15 bg-card p-10 text-center">
					<p className="text-sm text-muted-foreground">
						No snapshots yet — the nightly cron writes one per day. Hit
						&ldquo;Sync now&rdquo; in Settings → Bank account to capture the
						first one.
					</p>
				</div>
			) : (
				<div className="rounded-xl border bg-card p-4">
					<ResponsiveContainer width="100%" height={280}>
						<AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
							<defs>
								<linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
									<stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
								</linearGradient>
							</defs>
							<CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.15)" />
							<XAxis
								dataKey="label"
								tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
								axisLine={false}
								tickLine={false}
							/>
							<YAxis
								tickFormatter={(v) => formatGbp(v)}
								tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
								axisLine={false}
								tickLine={false}
								width={80}
							/>
							<Tooltip
								contentStyle={{
									background: "var(--color-card)",
									border: "1px solid rgba(127,127,127,0.2)",
									borderRadius: 8,
									fontSize: 12,
								}}
								formatter={(value) => [formatGbp(value), "Balance"]}
								labelFormatter={(_, payload) => payload?.[0]?.payload?.tooltipLabel ?? ""}
							/>
							<Area
								type="monotone"
								dataKey="cleared_minor"
								stroke="var(--color-primary)"
								strokeWidth={2}
								fill="url(#balanceFill)"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			)}
		</div>
	);
}
