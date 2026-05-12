import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { EventCard } from "@/site/ui/event-card";
import { listPublishedEvents } from "@/db/queries/events";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPageContent } from "@/db/queries/site-content";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "What's On — The Assembly Rooms",
	description: "Upcoming events at The Assembly Rooms.",
};

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
						{events.map((ev) => (
							<EventCard key={ev.id} event={ev} />
						))}
					</div>
				)}
			</Section>
		</>
	);
}
