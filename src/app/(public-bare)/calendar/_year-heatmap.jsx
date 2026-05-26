"use client";

import { groupItemsByDay, pad, timeFmt, KIND_DOT } from "./_helpers";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
	TooltipProvider,
} from "@/shadcn/components/ui/tooltip";

const MONTH_LABELS = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function intensityClass(n) {
	if (n === 0) return "bg-muted/30";
	if (n === 1) return "bg-primary/15";
	if (n === 2) return "bg-primary/30";
	if (n <= 4) return "bg-primary/50";
	return "bg-primary/75";
}

function monthCells(year, monthIdx) {
	const first = new Date(Date.UTC(year, monthIdx, 1));
	const last = new Date(Date.UTC(year, monthIdx + 1, 0));
	const startDow = (first.getUTCDay() + 6) % 7; // Monday-first
	const cells = [];
	for (let i = 0; i < startDow; i++) cells.push(null);
	for (let d = 1; d <= last.getUTCDate(); d++) {
		cells.push(new Date(Date.UTC(year, monthIdx, d)));
	}
	while (cells.length % 7 !== 0) cells.push(null);
	return cells;
}

const fullDateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short", day: "numeric", month: "long", year: "numeric",
});

/**
 * Mini-heatmap of all 12 months of the year, each day coloured by how
 * many calendar items touched it. Hovering over a day pops a tooltip
 * listing what's on. Clicking flips the view to that week so the user
 * can drill in.
 */
export default function YearHeatmap({ anchor, items, todayYmd, onDayClick }) {
	const year = anchor.getUTCFullYear();
	const byDay = groupItemsByDay(items);

	return (
		<TooltipProvider delayDuration={150}>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
				{MONTH_LABELS.map((label, monthIdx) => (
					<div key={label} className="rounded-md border p-3 space-y-2 bg-card">
						<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
							{label}
						</div>
						<div className="grid grid-cols-7 gap-1">
							{monthCells(year, monthIdx).map((d, i) => {
								if (!d) return <div key={i} className="aspect-square" />;
								const ymd = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
								const dayItems = byDay.get(ymd) ?? [];
								const isToday = ymd === todayYmd;
								const cellClass = `aspect-square w-full rounded-sm border text-[9px] flex items-center justify-center transition-opacity hover:opacity-80 ${
									intensityClass(dayItems.length)
								} ${isToday ? "ring-1 ring-primary" : "border-transparent"}`;
								const button = (
									<button
										type="button"
										onClick={() => onDayClick?.(ymd)}
										className={cellClass}
									>
										{d.getUTCDate()}
									</button>
								);
								if (dayItems.length === 0) {
									// No items - skip the tooltip entirely so the user
									// doesn't get an empty popover on every quiet day.
									return <div key={ymd}>{button}</div>;
								}
								return (
									<Tooltip key={ymd}>
										<TooltipTrigger asChild>{button}</TooltipTrigger>
										<TooltipContent
											side="top"
											className="max-w-xs bg-popover text-popover-foreground border shadow-md p-3 space-y-2"
										>
											<DayList
												dayLabel={fullDateFmt.format(d)}
												items={dayItems}
											/>
										</TooltipContent>
									</Tooltip>
								);
							})}
						</div>
					</div>
				))}
			</div>
		</TooltipProvider>
	);
}

function DayList({ dayLabel, items }) {
	return (
		<>
			<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
				{dayLabel}
			</div>
			<ul className="space-y-1.5">
				{items.map((it) => {
					const roomNames = (it.rooms ?? []).map((r) => r.room_name);
					return (
						<li key={it.id} className="flex items-start gap-2">
							<span
								className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${KIND_DOT[it.kind] || KIND_DOT.closure}`}
							/>
							<div className="min-w-0 text-xs leading-snug">
								<div className="font-medium">
									{it.title}
									{it.tentative && (
										<span className="ml-1 text-[10px] text-muted-foreground">(pending)</span>
									)}
								</div>
								<div className="text-muted-foreground">
									{timeFmt.format(new Date(it.starts_at))}
									{roomNames.length > 0 && ` · ${roomNames.join(", ")}`}
								</div>
							</div>
						</li>
					);
				})}
			</ul>
		</>
	);
}
