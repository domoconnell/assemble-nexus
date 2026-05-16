import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { RichText } from "@/site/ui/rich-text";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPageContent } from "@/db/queries/site-content";

export const metadata = {
	title: "About - The Assembly Rooms",
	description: "About The Assembly Rooms. The venue at the heart of Assemble Church.",
};

export const dynamic = "force-dynamic";

export default async function AboutPage() {
	const venue = await requireCurrentVenue();
	const content = await getPageContent(venue.id, "about");

	const hero = content.hero ?? {};
	const whoWeAre = content.who_we_are ?? {};
	const location = content.location ?? {};
	const cafe = content.cafe ?? {};
	const accessibility = content.accessibility ?? {};

	return (
		<>
			<Hero
				height="medium"
				kicker={hero.kicker ?? "About"}
				title={hero.title ?? "A venue inside a church."}
				subtitle={hero.subtitle ?? "The Assembly Rooms is the venue and hire arm of Assemble Church. Three rooms, a working café, and a team that has run a thousand nights."}
				hue="from-cyan-500/15 via-cyan-700/10 to-transparent"
			/>
			<Section
				kicker={whoWeAre.kicker ?? "Who we are"}
				title={whoWeAre.title ?? "Built for working nights."}
				intro={whoWeAre.intro ?? "Most venues hire out a room. We hire out a building that knows what it's doing. The same hands that run our own shows run yours."}
			>
				<div className="prose prose-invert max-w-3xl">
					{whoWeAre.body ? (
						<RichText html={whoWeAre.body} />
					) : (
						<p>
							Placeholder. Real about copy goes here: story, mission, who runs the
							place, how we got here.
						</p>
					)}
				</div>
			</Section>
			<Section
				id="location"
				kicker={location.kicker ?? "Find us"}
				title={location.title ?? "In the middle of town."}
			>
				<div className="prose prose-invert max-w-2xl text-base leading-relaxed">
					{location.body ? (
						<RichText html={location.body} />
					) : (
						<p className="text-muted-foreground">Address, transport links, and a map go here.</p>
					)}
				</div>
			</Section>
			<Section
				id="cafe"
				kicker={cafe.kicker ?? "Café"}
				title={cafe.title ?? "Open six days a week."}
			>
				<div className="prose prose-invert max-w-2xl text-base leading-relaxed">
					{cafe.body ? (
						<RichText html={cafe.body} />
					) : (
						<p className="text-muted-foreground">Hours, menu, and what's on the espresso machine go here.</p>
					)}
				</div>
			</Section>
			<Section
				id="accessibility"
				kicker={accessibility.kicker ?? "Accessibility"}
				title={accessibility.title ?? "Accessible by design."}
			>
				<div className="prose prose-invert max-w-2xl text-base leading-relaxed">
					{accessibility.body ? (
						<RichText html={accessibility.body} />
					) : (
						<p className="text-muted-foreground">Lift access, hearing loops, accessible toilets, and how to request anything else you need go here.</p>
					)}
				</div>
			</Section>
		</>
	);
}
