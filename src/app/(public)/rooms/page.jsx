import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { RoomCard } from "@/site/ui/room-card";
import { RichText } from "@/site/ui/rich-text";
import { listPublishedRooms } from "@/db/queries/rooms";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPageContent } from "@/db/queries/site-content";

export const metadata = {
	title: "Rooms - The Assembly Rooms",
	description: "Rooms for hire at The Assembly Rooms.",
};

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
	const venue = await requireCurrentVenue();
	const [rooms, content] = await Promise.all([
		listPublishedRooms(venue.id),
		getPageContent(venue.id, "rooms"),
	]);
	const hero = content.hero ?? {};

	return (
		<>
			<Hero
				height="medium"
				kicker={hero.kicker ?? "Rooms"}
				title={hero.title ? <RichText html={hero.title} /> : "Pick your room."}
				subtitle={hero.subtitle ? <RichText html={hero.subtitle} /> : "From the concert hall to the smaller reception spaces. Each one set up to do its thing better than anywhere else in town."}
			/>
			<Section>
				{rooms.length ? (
					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
						{rooms.map((room) => (
							<RoomCard key={room.id} room={room} />
						))}
					</div>
				) : (
					<p className="text-muted-foreground">No rooms published yet.</p>
				)}
			</Section>
		</>
	);
}
