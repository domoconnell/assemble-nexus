import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { CtaButton } from "@/site/ui/cta-button";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPageContent } from "@/db/queries/site-content";

export const metadata = {
	title: "Contact - The Assembly Rooms",
	description: "Get in touch with The Assembly Rooms.",
};

export const dynamic = "force-dynamic";

export default async function ContactPage() {
	const venue = await requireCurrentVenue();
	const content = await getPageContent(venue.id, "contact");

	const hero = content.hero ?? {};
	const hireBlock = content.hire_block ?? {};
	const general = content.general ?? {};
	const press = content.press ?? {};

	return (
		<>
			<Hero
				height="short"
				kicker={hero.kicker ?? "Contact"}
				title={hero.title ?? "Talk to us."}
				subtitle={hero.subtitle ?? "Quickest answer is the booking form. For everything else, here's how to reach a human."}
				hue="from-emerald-500/15 via-teal-700/10 to-transparent"
			/>
			<Section>
				<div className="grid gap-10 lg:grid-cols-2">
					<div className="space-y-8">
						<div>
							<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">
								{hireBlock.title ?? "Hire enquiries"}
							</h2>
							<p className="mt-3 text-base text-muted-foreground leading-relaxed">
								{hireBlock.body ?? "The booking form is fastest. We respond within a working day."}
							</p>
							<div className="mt-5">
								<CtaButton href="/book">
									{hireBlock.cta_label ?? "Start a booking"}
								</CtaButton>
							</div>
						</div>
						<div>
							<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">
								{general.title ?? "General"}
							</h2>
							<p className="mt-3 text-base text-muted-foreground leading-relaxed">
								<a
									href={`mailto:${general.email ?? "hello@example.com"}`}
									className="text-foreground hover:text-primary transition"
								>
									{general.email ?? "hello@example.com"}
								</a>
							</p>
						</div>
						<div>
							<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">
								{press.title ?? "Press"}
							</h2>
							<p className="mt-3 text-base text-muted-foreground leading-relaxed">
								<a
									href={`mailto:${press.email ?? "press@example.com"}`}
									className="text-foreground hover:text-primary transition"
								>
									{press.email ?? "press@example.com"}
								</a>
							</p>
						</div>
					</div>
				</div>
			</Section>
		</>
	);
}
