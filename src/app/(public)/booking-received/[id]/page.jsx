import { notFound } from "next/navigation";
import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { Container } from "@/site/ui/container";
import { CtaButton } from "@/site/ui/cta-button";
import { getBookingById } from "@/db/queries/bookings";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "Booking received - The Assembly Rooms",
};

/**
 * Post-submit landing page for a freshly-enquired booking. The booker
 * isn't signed in yet at this point — the booking widget redirects
 * here so they see a confirmation before we ask them to authenticate
 * to view the booking detail. The next-step link to /my-bookings/[id]
 * will magic-link them in.
 */
export default async function BookingReceivedPage({ params }) {
	const { id } = await params;
	const b = await getBookingById(id);
	if (!b) notFound();

	return (
		<>
			<Hero
				height="short"
				kicker="Enquiry received"
				title="Thanks - we've got your booking."
				subtitle="We'll review it and email you back, usually within a working day. Once it's approved we'll send the booking agreement and a link to pay your deposit."
			/>
			<Section>
				<Container className="max-w-2xl">
					<div className="rounded-xl border border-foreground/10 bg-card p-8 space-y-5">
						<div>
							<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
								Your reference
							</div>
							<div className="mt-2 font-mono text-2xl">{b.reference}</div>
						</div>
						<p className="text-sm text-foreground/85">
							A copy of your enquiry has been emailed to you. You can come back
							at any time to track its progress, pay your deposit, and (when it's
							a ticketed event) set up your event page.
						</p>
						<div className="flex flex-col sm:flex-row gap-3 pt-2">
							<CtaButton href={`/my-bookings/${b.id}`} className="w-full sm:w-auto">
								View my booking →
							</CtaButton>
							<CtaButton href="/" variant="outline" className="w-full sm:w-auto">
								Back to home
							</CtaButton>
						</div>
						<p className="text-xs text-muted-foreground pt-2">
							When you tap "View my booking" we'll ask you to sign in - we email
							you a one-click link, no password.
						</p>
					</div>
				</Container>
			</Section>
		</>
	);
}
