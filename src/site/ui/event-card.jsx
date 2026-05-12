import Link from "next/link";
import Image from "next/image";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	timeZone: "Europe/London",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

/**
 * Public-site event card. Used on the home page's "Next few nights" grid
 * and the What's On listing. Renders the banner image, then a date+time
 * block that overlaps the bottom of the image (negative margin) followed
 * by the ticketed/free tag, title, summary, and a CTA line.
 *
 * Accepts the event row shape returned by `listPublishedEvents` /
 * `listPublishedEventsForRoom` — snake_case fields plus `banner_url`.
 */
export function EventCard({ event, variant = "default" }) {
	const ev = event;
	const date = ev.starts_at ? new Date(ev.starts_at) : null;
	const dateLabel = date ? dateFmt.format(date) : "Date TBA";
	const timeLabel = date ? timeFmt.format(date) : "";
	const externalHref = ev.external_url || null;
	const href = externalHref || `/events/${ev.slug}`;
	const isCompact = variant === "compact";
	return (
		<Link
			href={href}
			{...(externalHref ? { target: "_blank", rel: "noreferrer" } : {})}
			className="group relative flex flex-col overflow-hidden rounded-xl border border-foreground/10 bg-card transition hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
		>
			<div
				className={`relative ${isCompact ? "h-44" : "h-48"} overflow-hidden bg-muted/40`}
			>
				{ev.banner_url && (
					<Image
						src={ev.banner_url}
						alt={ev.title}
						fill
						sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
						className="object-cover grayscale-40 group-hover:grayscale-0 transition duration-500"
					/>
				)}
				<div className="absolute inset-0 bg-linear-to-t from-card via-card/40 to-transparent" />
			</div>
			<div
				className={`relative z-10 ${isCompact ? "-mt-10" : "-mt-12"} flex flex-col items-center text-foreground text-center`}
			>
				<span
					className={`font-display ${isCompact ? "text-2xl" : "text-3xl"} tracking-tight leading-none`}
				>
					{dateLabel}
				</span>
				{timeLabel && (
					<span
						className={`mt-1 ${isCompact ? "text-[10px]" : "text-xs"} uppercase tracking-[0.22em] text-foreground/70`}
					>
						{timeLabel}
					</span>
				)}
			</div>
			<div className={`flex flex-1 flex-col ${isCompact ? "gap-2 p-5" : "gap-3 p-6"}`}>
				<div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
					<span className={ev.is_ticketed ? "text-primary" : ""}>
						{ev.is_ticketed ? "Ticketed" : "Free entry"}
					</span>
				</div>
				<h3
					className={`font-display ${isCompact ? "text-lg" : "text-2xl"} tracking-tight`}
				>
					{ev.title}
				</h3>
				{ev.summary && (
					<p
						className={`text-sm text-muted-foreground leading-relaxed ${isCompact ? "line-clamp-2" : ""}`}
					>
						{ev.summary}
					</p>
				)}
				<div className="mt-auto pt-4 text-sm font-medium text-primary group-hover:translate-x-0.5 transition">
					{ev.is_ticketed ? "Get tickets →" : "More info →"}
				</div>
			</div>
		</Link>
	);
}
