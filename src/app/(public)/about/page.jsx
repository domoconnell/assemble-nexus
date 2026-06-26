import { Hero } from "@/site/ui/hero";
import { Container } from "@/site/ui/container";
import { RichText } from "@/site/ui/rich-text";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPageContent } from "@/db/queries/site-content";

export const metadata = {
	title: "About - The Assembly Rooms",
	description: "The Assembly Rooms, the commercial hire arm of Assemble Church.",
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
				title={
					hero.title ? <RichText html={hero.title} /> : "The Assembly Rooms."
				}
				subtitle={
					hero.subtitle ? (
						<RichText html={hero.subtitle} />
					) : (
						"Assemble Church meets here on Sundays. The rest of the week, the building's two main rooms, the Concert Hall and the Studio, are available to hire."
					)
				}
				hue="from-cyan-500/15 via-cyan-700/10 to-transparent"
			/>

			<section className="py-16 lg:py-20 border-b border-foreground/10">
				<Container>
					<div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
						<div>
							<div className="text-xs uppercase tracking-[0.22em] text-primary font-medium">
								{whoWeAre.kicker ?? "Who we are"}
							</div>
							<h2 className="mt-3 font-display text-3xl sm:text-4xl lg:text-5xl leading-[1.05] tracking-tight">
								{whoWeAre.title ?? "Who we are."}
							</h2>
						</div>
						<div className="prose prose-invert max-w-none text-base sm:text-lg leading-relaxed">
							{whoWeAre.intro ? (
								<RichText html={whoWeAre.intro} />
							) : (
								<p className="text-foreground/90 lead">
									The Assembly Rooms is the commercial hire side of
									Assemble Church. Same building, same team. A working
									church on Sundays, and a venue for hire the rest of
									the week.
								</p>
							)}
							{whoWeAre.body ? (
								<RichText html={whoWeAre.body} />
							) : (
								<>
									<p>
										The building is a late-1800s Methodist chapel in
										the centre of Newark, and it's been part of the
										town's civic life since it went up. The Concert
										Hall is its centrepiece, a 250-capacity main room
										for concerts, conferences, awards nights, weddings
										and ceremonies. The Studio at the back is the
										everyday room: classes, parties, community
										meetings, rehearsals, the things that fill an
										ordinary week.
									</p>
									<p>
										We hire both rooms out to anyone who wants to use
										them. Get in touch with what you've got in mind
										and we'll tell you whether it fits. Most things do.
									</p>
								</>
							)}
						</div>
					</div>
				</Container>
			</section>

			<section className="py-16 lg:py-20">
				<Container>
					<div className="text-xs uppercase tracking-[0.22em] text-primary font-medium">
						Visit
					</div>
					<h2 className="mt-3 font-display text-3xl sm:text-4xl lg:text-5xl leading-[1.05] tracking-tight">
						Visiting the building.
					</h2>

					<div className="mt-12 grid gap-px bg-foreground/10 rounded-xl overflow-hidden border border-foreground/10 sm:grid-cols-2 lg:grid-cols-3">
						<article
							id="location"
							className="bg-card p-6 lg:p-8 space-y-4"
						>
							<div className="text-[11px] uppercase tracking-[0.22em] text-primary font-medium">
								{location.kicker ?? "Find us"}
							</div>
							<h3 className="font-display text-2xl tracking-tight">
								{location.title ?? "Find us."}
							</h3>
							<div className="text-sm text-foreground/85 leading-relaxed space-y-3">
								{location.body ? (
									<RichText html={location.body} />
								) : (
									<>
										<p className="font-mono not-italic">
											The Assembly Rooms,
											<br />
											Barnby Gate,
											<br />
											Newark, Nottinghamshire,
											<br />
											NG24 1PX.
										</p>
										<p>
											In the centre of Newark, a short walk from both
											Newark Castle and Newark North Gate stations.
										</p>
									</>
								)}
							</div>
						</article>

						<article
							id="cafe"
							className="bg-card p-6 lg:p-8 space-y-4"
						>
							<div className="text-[11px] uppercase tracking-[0.22em] text-primary font-medium">
								{cafe.kicker ?? "Café"}
							</div>
							<h3 className="font-display text-2xl tracking-tight">
								{cafe.title ?? "Café."}
							</h3>
							<div className="text-sm text-foreground/85 leading-relaxed">
								{cafe.body ? (
									<RichText html={cafe.body} />
								) : (
									<p>
										There's a café in the building. If you're hiring
										a room and want catering or refreshments to go
										with it, mention it when you enquire and we'll
										factor it in.
									</p>
								)}
							</div>
						</article>

						<article
							id="accessibility"
							className="bg-card p-6 lg:p-8 space-y-4"
						>
							<div className="text-[11px] uppercase tracking-[0.22em] text-primary font-medium">
								{accessibility.kicker ?? "Access"}
							</div>
							<h3 className="font-display text-2xl tracking-tight">
								{accessibility.title ?? "Access."}
							</h3>
							<div className="text-sm text-foreground/85 leading-relaxed">
								{accessibility.body ? (
									<RichText html={accessibility.body} />
								) : (
									<p>
										The building is a working Victorian church, which
										brings the trade-offs of older architecture. If you
										have specific access requirements for an event,
										drop us a line ahead of time and we'll talk
										through what the building can do.
									</p>
								)}
							</div>
						</article>
					</div>
				</Container>
			</section>
		</>
	);
}
