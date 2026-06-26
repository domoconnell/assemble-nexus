import Image from "next/image";
import { Hero } from "@/site/ui/hero";
import { Container } from "@/site/ui/container";
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
				subtitle={
					hero.subtitle ? (
						<RichText html={hero.subtitle} />
					) : (
						"The booking form is the quickest route. For everything else, here's how to reach a human."
					)
				}
				hue="from-emerald-500/15 via-teal-700/10 to-transparent"
			/>

			<section className="py-16 lg:py-20">
				<Container>
					<div className="rounded-xl overflow-hidden border border-foreground/10 bg-card">
						<div className="grid gap-px bg-foreground/10 sm:grid-cols-2">
							<div className="bg-card p-6 lg:p-10 space-y-8">
								<div className="space-y-4">
									<div className="text-[11px] uppercase tracking-[0.22em] text-primary font-medium">
										{hireBlock.title ?? "Hire enquiries"}
									</div>
									<div className="text-base text-foreground/85 leading-relaxed">
										{hireBlock.body ? (
											<RichText html={hireBlock.body} />
										) : (
											<p>
												The booking form is fastest. We respond
												within a working day.
											</p>
										)}
									</div>
									<div className="pt-1">
										<CtaButton href="/book">
											{hireBlock.cta_label ?? "Start a booking"}
										</CtaButton>
									</div>
								</div>

								<div className="space-y-4 border-t border-foreground/10 pt-6">
									<div className="text-[11px] uppercase tracking-[0.22em] text-primary font-medium">
										{general.title ?? "General"}
									</div>
									<dl className="space-y-3">
										{contactEmail && (
											<div>
												<dt className="text-xs text-muted-foreground">
													Email
												</dt>
												<dd className="mt-1">
													<a
														href={`mailto:${contactEmail}`}
														className="text-foreground hover:text-primary transition font-mono text-sm sm:text-base"
													>
														{contactEmail}
													</a>
												</dd>
											</div>
										)}
										{phone && (
											<div>
												<dt className="text-xs text-muted-foreground">
													Phone
												</dt>
												<dd className="mt-1">
													<a
														href={`tel:${phone.replace(/\s+/g, "")}`}
														className="text-foreground hover:text-primary transition font-mono text-sm sm:text-base"
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
								<div className="bg-card p-6 lg:p-10 space-y-4">
									<div className="text-[11px] uppercase tracking-[0.22em] text-primary font-medium">
										Address
									</div>
									<address className="not-italic text-foreground/85 leading-relaxed font-mono text-base sm:text-lg">
										{addressLines.map((line) => (
											<div key={line}>{line}</div>
										))}
									</address>
								</div>
							)}
						</div>

						<div className="border-t border-foreground/10 relative aspect-1831/859">
							<Image
								src="/assembly-rooms-map.png"
								alt="Map showing the location of The Assembly Rooms on Barnby Gate, Newark"
								fill
								sizes="(min-width: 1024px) 1240px, 100vw"
								className="object-cover"
							/>
						</div>
					</div>
				</Container>
			</section>
		</>
	);
}
