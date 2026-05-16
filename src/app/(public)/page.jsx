import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { CtaButton } from "@/site/ui/cta-button";
import { RoomCard } from "@/site/ui/room-card";
import { EventCard } from "@/site/ui/event-card";
import { listPublishedRooms } from "@/db/queries/rooms";
import { listPublishedEvents } from "@/db/queries/events";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPageContent } from "@/db/queries/site-content";
import { RichText } from "@/site/ui/rich-text";

export const metadata = {
	title: "The Assembly Rooms - Music venue & corporate hire",
	description:
		"Three rooms, a working café, and a team that knows the room. Concerts, conferences, weddings.",
};

export const dynamic = "force-dynamic";

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
				backgroundGreyscale={false}
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
						{upcoming.map((ev) => (
							<EventCard key={ev.id} event={ev} />
						))}
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
