import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { CtaButton } from "@/site/ui/cta-button";
import { RichText } from "@/site/ui/rich-text";
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

	const phone = venue.phone ?? null;
	const contactEmail = venue.contact_email ?? general.email ?? null;
	const addressLines = Array.isArray(venue.address_lines)
		? venue.address_lines.filter(Boolean)
		: [];

	return (
		<>
			<Hero
				height="short"
				kicker={hero.kicker ?? "Contact"}
				title={hero.title ? <RichText html={hero.title} /> : "Talk to us."}
				subtitle={hero.subtitle ? <RichText html={hero.subtitle} /> : "Quickest answer is the booking form. For everything else, here's how to reach a human."}
				hue="from-emerald-500/15 via-teal-700/10 to-transparent"
			/>
			<Section className="py-12! lg:py-16!">
				<div className="grid gap-10 lg:grid-cols-2">
					<div className="space-y-8">
						<div>
							<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">
								{hireBlock.title ?? "Hire enquiries"}
							</h2>
							<div className="mt-3 text-base text-muted-foreground leading-relaxed">
								{hireBlock.body ? (
									<RichText html={hireBlock.body} />
								) : (
									<p>The booking form is fastest. We respond within a working day.</p>
								)}
							</div>
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
							<dl className="mt-3 space-y-2 text-base text-muted-foreground">
								{contactEmail && (
									<div>
										<dt className="sr-only">Email</dt>
										<dd>
											<a
												href={`mailto:${contactEmail}`}
												className="text-foreground hover:text-primary transition"
											>
												{contactEmail}
											</a>
										</dd>
									</div>
								)}
								{phone && (
									<div>
										<dt className="sr-only">Phone</dt>
										<dd>
											<a
												href={`tel:${phone.replace(/\s+/g, "")}`}
												className="text-foreground hover:text-primary transition"
											>
												{phone}
											</a>
										</dd>
									</div>
								)}
							</dl>
						</div>

					</div>

					{addressLines.length > 0 && (
						<div>
							<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">
								Address
							</h2>
							<address className="mt-3 text-base not-italic text-muted-foreground leading-relaxed">
								{addressLines.map((line) => (
									<div key={line}>{line}</div>
								))}
							</address>
						</div>
					)}
				</div>
			</Section>
		</>
	);
}
