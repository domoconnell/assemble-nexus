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
 * `listPublishedEventsForRoom` - snake_case fields plus `banner_url`.
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
				{ev.banner_url ? (
					<Image
						src={ev.banner_url}
						alt={ev.title}
						fill
						sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
						className="object-cover grayscale-40 group-hover:grayscale-0 transition duration-500"
					/>
				) : (
					<EventCardFallbackHeader seed={ev.id ?? ev.slug ?? ev.title ?? ""} />
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

/**
 * Pure-CSS hero stand-in for events without a banner. Derives a stable
 * hue + secondary hue from a seed string so the same event always
 * renders the same colour, but different events get visual variety.
 * Two radial gradients + a soft conic stripe + a subtle dot grid sit
 * over each other to keep the panel feeling intentional rather than
 * "missing image".
 */
function EventCardFallbackHeader({ seed }) {
	const hash = simpleHash(String(seed) || "event");
	const hue = hash % 360;
	const hue2 = (hue + 60) % 360;
	const hue3 = (hue + 200) % 360;
	const style = {
		backgroundColor: `oklch(0.32 0.07 ${hue})`,
		backgroundImage: [
			// Two radial blooms in mixed hues
			`radial-gradient(circle at 20% 20%, oklch(0.62 0.16 ${hue2} / 0.55), transparent 55%)`,
			`radial-gradient(circle at 80% 70%, oklch(0.55 0.18 ${hue3} / 0.45), transparent 60%)`,
			// Faint angled stripe to add direction
			`linear-gradient(135deg, oklch(1 0 0 / 0.04) 0%, transparent 40%, oklch(0 0 0 / 0.08) 100%)`,
			// Sparse dot grid for texture
			"radial-gradient(oklch(1 0 0 / 0.06) 1px, transparent 1.5px)",
		].join(", "),
		backgroundSize: "auto, auto, auto, 14px 14px",
	};
	return <div aria-hidden className="absolute inset-0" style={style} />;
}

function simpleHash(s) {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = (h * 31 + s.charCodeAt(i)) >>> 0;
	}
	return h;
}
