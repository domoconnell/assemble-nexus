import Link from "next/link";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	timeZone: "Europe/London",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

export function EventCard({ event }) {
	const date = new Date(event.startsAt);
	const dateLabel = dateFormatter.format(date);
	const timeLabel = timeFormatter.format(date);

	return (
		<Link
			href={`/events/${event.slug}`}
			className="group relative flex flex-col overflow-hidden rounded-xl border border-foreground/10 bg-card transition hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
		>
			<div className={`relative h-48 overflow-hidden bg-linear-to-br ${event.hue || "from-indigo-500/15 via-violet-700/10 to-transparent"}`}>
				<div className="absolute inset-0 bg-[radial-gradient(40%_70%_at_70%_30%,oklch(1_0_0/0.06)_0%,transparent_70%)]" />
				<div className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-card to-transparent" />
				<div className="absolute left-5 top-5 flex items-baseline gap-2 text-foreground/80">
					<span className="font-display text-3xl tracking-tight">{dateLabel}</span>
					<span className="text-xs uppercase tracking-[0.22em] text-foreground/60">{timeLabel}</span>
				</div>
			</div>
			<div className="flex flex-1 flex-col gap-3 p-6">
				<div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
					<span>{event.room}</span>
					<span aria-hidden>·</span>
					<span className={event.isTicketed ? "text-primary" : ""}>
						{event.isTicketed ? "Ticketed" : "Free entry"}
					</span>
				</div>
				<h3 className="font-display text-2xl tracking-tight">{event.title}</h3>
				<p className="text-sm text-muted-foreground leading-relaxed">
					{event.summary}
				</p>
				<div className="mt-auto pt-4 text-sm font-medium text-primary group-hover:translate-x-0.5 transition">
					{event.isTicketed ? "Get tickets →" : "More info →"}
				</div>
			</div>
		</Link>
	);
}
