import Link from "next/link";
import Image from "next/image";
import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { CtaButton } from "@/site/ui/cta-button";
import { RoomCard } from "@/site/ui/room-card";
import { listPublishedRooms } from "@/db/queries/rooms";
import { listPublishedEvents } from "@/db/queries/events";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPageContent } from "@/db/queries/site-content";
import { RichText } from "@/site/ui/rich-text";

export const metadata = {
	title: "The Assembly Rooms — Music venue & corporate hire",
	description:
		"Three rooms, a working café, and a team that knows the room. Concerts, conferences, weddings.",
};

export const dynamic = "force-dynamic";

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

export default async function HomePage() {
	const venue = await requireCurrentVenue();
	const [rooms, allEvents, content] = await Promise.all([
		listPublishedRooms(venue.id),
		listPublishedEvents(venue.id),
		getPageContent(venue.id, "home"),
	]);
	const now = Date.now();
	const upcoming = allEvents
		.filter((e) => e.starts_at && new Date(e.starts_at).getTime() >= now)
		.slice(0, 3);

	const hero = content.hero ?? {};
	const roomsSec = content.rooms_section ?? {};
	const whatsOnSec = content.whats_on_section ?? {};
	const hireSec = content.hire_section ?? {};

	const heroTitle = hero.title
		? <RichText html={hero.title} />
		: (
			<>
				The room <em className="italic font-display text-primary">remembers</em>
				<br />
				every show.
			</>
		);

	return (
		<>
			<Hero
				kicker={hero.kicker ?? "Live music · Conferences · Weddings"}
				title={heroTitle}
				subtitle={hero.subtitle ?? "A 400-capacity concert hall, two flexible rooms, a working café, and a team that knows the room. Hire it. Perform in it. Get married in it."}
				backgroundImage={hero.background_file_id_url ?? undefined}
				backgroundAlt="Assembly Rooms"
				actions={
					<>
						<CtaButton href="/rooms" size="lg">
							Explore the rooms
						</CtaButton>
						{upcoming.length > 0 && (
							<CtaButton href="/whats-on" variant="outline" size="lg">
								What's on
							</CtaButton>
						)}
					</>
				}
			/>

			<Section
				kicker={roomsSec.kicker ?? "Rooms"}
				title={roomsSec.title ?? "Built to host the night."}
				intro={roomsSec.intro ?? "From a tuned-up concert hall to a glass-fronted reception space, every room is set up to make the night feel inevitable."}
			>
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{rooms.map((room) => (
						<RoomCard key={room.id} room={room} />
					))}
				</div>
			</Section>

			{upcoming.length > 0 && (
				<Section
					kicker={whatsOnSec.kicker ?? "What's on"}
					title={whatsOnSec.title ?? "The next few nights."}
					intro={whatsOnSec.intro ?? "A taste of what's coming up. Some ours, some yours."}
				>
					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
						{upcoming.map((ev) => {
							const date = ev.starts_at ? new Date(ev.starts_at) : null;
							const externalHref = ev.external_url || null;
							const href = externalHref || `/events/${ev.slug}`;
							return (
								<Link
									key={ev.id}
									href={href}
									{...(externalHref ? { target: "_blank", rel: "noreferrer" } : {})}
									className="group relative flex flex-col overflow-hidden rounded-xl border border-foreground/10 bg-card transition hover:border-primary/40 hover:bg-card/80"
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
										{date && (
											<div className="absolute left-5 top-5 flex items-baseline gap-2 text-foreground">
												<span className="font-display text-3xl tracking-tight">
													{dateFmt.format(date)}
												</span>
												<span className="text-xs uppercase tracking-[0.22em] text-foreground/70">
													{timeFmt.format(date)}
												</span>
											</div>
										)}
									</div>
									<div className="flex flex-1 flex-col gap-3 p-6">
										<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
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
					<div className="mt-12 flex justify-center">
						<CtaButton href="/whats-on" variant="outline">
							See the full diary
						</CtaButton>
					</div>
				</Section>
			)}

			<Section
				align="center"
				kicker={hireSec.kicker ?? "Hire"}
				title={hireSec.title ?? "Let's plan your night."}
				intro={hireSec.intro ?? "Tell us when, what, and how big. We'll quote you within a working day."}
			>
				<div className="mt-2 flex justify-center">
					<CtaButton href="/book" size="lg">
						{hireSec.cta_label ?? "Start a booking"}
					</CtaButton>
				</div>
			</Section>
		</>
	);
}
