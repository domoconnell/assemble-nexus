/**
 * Month-grid heatmap of activity for the dashboard. Server component — no
 * interaction yet, just colour-by-density per day.
 */

const dayHeaderFmt = ["M", "T", "W", "T", "F", "S", "S"];
const monthHeaderFmt = new Intl.DateTimeFormat("en-GB", {
	month: "long",
	year: "numeric",
	timeZone: "Europe/London",
});

function pad(n) {
	return String(n).padStart(2, "0");
}

function daysInMonth(year, month1) {
	return new Date(year, month1, 0).getDate();
}

// Monday=0 ... Sunday=6 (UK week start)
function weekdayMondayBased(year, month1, day) {
	const d = new Date(Date.UTC(year, month1 - 1, day));
	const w = d.getUTCDay(); // Sun=0..Sat=6
	return (w + 6) % 7;
}

export default function ActivityCalendar({ year, month1, activity = {}, todayKey }) {
	const monthLabel = monthHeaderFmt.format(new Date(Date.UTC(year, month1 - 1, 1)));
	const total = daysInMonth(year, month1);
	const leading = weekdayMondayBased(year, month1, 1);

	const cells = [];
	for (let i = 0; i < leading; i++) cells.push(null);
	for (let d = 1; d <= total; d++) {
		const key = `${year}-${pad(month1)}-${pad(d)}`;
		cells.push({ day: d, key, activity: activity[key] ?? null });
	}
	while (cells.length % 7 !== 0) cells.push(null);

	const maxActivity = Math.max(
		1,
		...Object.values(activity).map((a) => a.total ?? 0),
	);

	return (
		<div className="space-y-3">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
					Calendar
				</h3>
				<span className="text-xs text-muted-foreground">{monthLabel}</span>
			</div>
			<div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
				{dayHeaderFmt.map((d, i) => (
					<div key={i} className="text-center py-1">
						{d}
					</div>
				))}
			</div>
			<div className="grid grid-cols-7 gap-1">
				{cells.map((c, i) => {
					if (!c) return <div key={`pad-${i}`} className="aspect-square" />;
					const intensity = c.activity
						? Math.min(1, c.activity.total / maxActivity)
						: 0;
					const isToday = c.key === todayKey;
					const bgStyle =
						intensity > 0
							? {
									backgroundColor: `color-mix(in oklch, var(--color-primary), transparent ${Math.round(100 - intensity * 70)}%)`,
								}
							: undefined;
					return (
						<div
							key={c.key}
							className={`aspect-square rounded-md border text-[11px] flex flex-col justify-between p-1.5 ${
								isToday
									? "border-primary/60 ring-1 ring-primary/40"
									: intensity > 0
										? "border-primary/30"
										: "border-foreground/5"
							}`}
							style={bgStyle}
							title={
								c.activity
									? `${c.activity.bookings} bookings · ${c.activity.events} events · ${c.activity.blockouts} blockouts`
									: undefined
							}
						>
							<span className="font-mono tabular-nums">{c.day}</span>
							{c.activity && c.activity.total > 0 && (
								<span className="text-[9px] text-muted-foreground">
									{c.activity.total}
								</span>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
