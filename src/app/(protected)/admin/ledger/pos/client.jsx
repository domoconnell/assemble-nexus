"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

function pad(n) {
	return String(n).padStart(2, "0");
}

function buildCalendar(year, month1) {
	const first = new Date(Date.UTC(year, month1 - 1, 1));
	const last = new Date(Date.UTC(year, month1, 0));
	const daysInMonth = last.getUTCDate();
	// Monday-first grid.
	const firstWeekday = (first.getUTCDay() + 6) % 7;
	const cells = [];
	for (let i = 0; i < firstWeekday; i++) cells.push(null);
	for (let d = 1; d <= daysInMonth; d++) {
		cells.push(`${year}-${pad(month1)}-${pad(d)}`);
	}
	while (cells.length % 7 !== 0) cells.push(null);
	return cells;
}

const dayLabelFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	timeZone: "UTC",
});

export default function PosClient({
	ym,
	monthYear,
	monthMonth1,
	takings,
	squareConfigured,
	squareEnv,
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	const byDate = useMemo(
		() => new Map(takings.map((t) => [t.date, t])),
		[takings],
	);
	const totalNet = takings.reduce((s, t) => s + (t.net_cents ?? 0), 0);
	const totalGross = takings.reduce((s, t) => s + (t.gross_cents ?? 0), 0);
	const totalCogs = takings.reduce((s, t) => s + (t.cogs_cents ?? 0), 0);

	const cells = buildCalendar(monthYear, monthMonth1);

	function resync(from, to, label = "Sync") {
		startTransition(async () => {
			try {
				const response = await fetch("/api/finance/pos/sync", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ from, to }),
				});
				const data = await response.json();
				if (!response.ok) {
					toast.error(data.error || `${label} failed`);
					return;
				}
				toast.success(`Synced ${data.days_synced} ${data.days_synced === 1 ? "day" : "days"}`);
				router.refresh();
			} catch (err) {
				toast.error(err?.message || `${label} failed`);
			}
		});
	}

	const monthStart = `${ym}-01`;
	const monthEnd = `${monthYear}-${pad(monthMonth1)}-${pad(new Date(Date.UTC(monthYear, monthMonth1, 0)).getUTCDate())}`;

	return (
		<div className="space-y-6">
			<section className="rounded-lg border bg-card p-6 space-y-4">
				<div className="flex items-baseline justify-between gap-4 flex-wrap">
					<div className="grid gap-4 sm:grid-cols-3 flex-1">
						<KpiCard label="Net (excl. VAT)" value={fmt(totalNet)} />
						<KpiCard label="Gross" value={fmt(totalGross)} />
						<KpiCard label="Cost of goods" value={fmt(totalCogs)} hint={totalCogs === 0 ? "Set cost prices in Square to enable" : null} />
					</div>
					<div className="flex flex-col items-end gap-1">
						<Button
							onClick={() => resync(monthStart, monthEnd, "Sync month")}
							disabled={pending || !squareConfigured}
						>
							{pending ? "Syncing…" : "Sync this month"}
						</Button>
						{squareConfigured && (
							<span className="text-[11px] text-muted-foreground">
								Square: {squareEnv}
							</span>
						)}
					</div>
				</div>
			</section>

			<section className="rounded-lg border bg-card p-4">
				<div className="grid grid-cols-7 gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground pb-2 border-b border-foreground/10">
					{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
						<div key={d} className="px-1">
							{d}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7 gap-2 pt-3">
					{cells.map((ymd, i) => {
						if (!ymd) return <div key={`empty-${i}`} />;
						const day = byDate.get(ymd);
						const dayNum = Number(ymd.slice(8, 10));
						return (
							<div
								key={ymd}
								className="rounded-md border border-foreground/10 bg-background min-h-[88px] p-2 flex flex-col gap-1"
							>
								<div className="flex items-baseline justify-between">
									<span className="text-xs font-medium">{dayNum}</span>
									{day && (
										<span className="text-[10px] text-muted-foreground">
											{day.transactions_count}×
										</span>
									)}
								</div>
								{day ? (
									<>
										<div className="font-mono text-sm">{fmt(day.net_cents)}</div>
										{day.vat_cents > 0 && (
											<div className="text-[10px] text-muted-foreground">
												VAT {fmt(day.vat_cents)}
											</div>
										)}
									</>
								) : (
									<div className="flex-1" />
								)}
							</div>
						);
					})}
				</div>
			</section>
		</div>
	);
}

function KpiCard({ label, value, hint }) {
	return (
		<div className="rounded-md border bg-background p-3">
			<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
			<div className="mt-1 font-display text-xl">{value}</div>
			{hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
		</div>
	);
}
