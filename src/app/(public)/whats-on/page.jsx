import Link from "next/link";
import Image from "next/image";
import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { listPublishedEvents } from "@/db/queries/events";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPageContent } from "@/db/queries/site-content";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "What's On — The Assembly Rooms",
	description: "Upcoming events at The Assembly Rooms.",
};

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

export default async function WhatsOnPage() {
	const venue = await requireCurrentVenue();
	const [events, content] = await Promise.all([
		listPublishedEvents(venue.id),
		getPageContent(venue.id, "whats_on"),
	]);
	const hero = content.hero ?? {};
	const empty = content.empty_state ?? {};

	return (
		<>
			<Hero
				height="medium"
				kicker={hero.kicker ?? "What's on"}
				title={hero.title ?? "The next few nights."}
				subtitle={hero.subtitle ?? "Concerts, panels, launches, and the odd weird night out. A mix of our own shows and what's hired the rooms."}
				hue="from-violet-500/15 via-indigo-700/10 to-transparent"
			/>
			<Section>
				{events.length === 0 ? (
					<div className="rounded-xl border border-foreground/10 bg-card p-10 text-center max-w-md mx-auto">
						<h2 className="font-display text-2xl tracking-tight">{empty.title ?? "Nothing on yet."}</h2>
						<p className="mt-3 text-sm text-muted-foreground">
							{empty.body ?? "Check back soon — we’re putting the next few months together."}
						</p>
					</div>
				) : (
					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
						{events.map((ev) => {
							const date = ev.starts_at ? new Date(ev.starts_at) : null;
							const externalHref = ev.external_url || null;
							const href = externalHref || `/events/${ev.slug}`;
							const dateLabel = date ? dateFmt.format(date) : "Date TBA";
							const timeLabel = date ? timeFmt.format(date) : "";
							return (
								<Link
									key={ev.id}
									href={href}
									{...(externalHref ? { target: "_blank", rel: "noreferrer" } : {})}
									className="group relative flex flex-col overflow-hidden rounded-xl border border-foreground/10 bg-card transition hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
								>
									<div className="relative h-48 overflow-hidden bg-muted/40">
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
										<div className="absolute left-5 top-5 flex items-baseline gap-2 text-foreground">
											<span className="font-display text-3xl tracking-tight">{dateLabel}</span>
											{timeLabel && (
												<span className="text-xs uppercase tracking-[0.22em] text-foreground/70">
													{timeLabel}
												</span>
											)}
										</div>
									</div>
									<div className="flex flex-1 flex-col gap-3 p-6">
										<div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
											<span className={ev.is_ticketed ? "text-primary" : ""}>
												{ev.is_ticketed ? "Ticketed" : "Free entry"}
											</span>
										</div>
										<h3 className="font-display text-2xl tracking-tight">{ev.title}</h3>
										{ev.summary && (
											<p className="text-sm text-muted-foreground leading-relaxed">
												{ev.summary}
											</p>
										)}
										<div className="mt-auto pt-4 text-sm font-medium text-primary group-hover:translate-x-0.5 transition">
											{ev.is_ticketed ? "Get tickets →" : "More info →"}
										</div>
									</div>
								</Link>
							);
						})}
					</div>
				)}
			</Section>
		</>
	);
}
