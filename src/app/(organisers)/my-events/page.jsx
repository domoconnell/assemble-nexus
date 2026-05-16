import Link from "next/link";
import { listEventsForHirer } from "@/db/queries/events";
import { Container } from "@/site/ui/container";
import { Hero } from "@/site/ui/hero";
import { CtaButton } from "@/site/ui/cta-button";
import { getServerSession } from "@/utils/auth/server-guard";
import MagicLinkForm from "../_components/magic-link-form";
import OrganiserNav from "../_components/organiser-nav";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "My events - The Assembly Rooms",
};

const stampFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});

function eventStatusClass(status) {
	switch (status) {
		case "draft":
			return "border-foreground/15 bg-muted text-muted-foreground";
		case "pending_review":
			return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
		case "published":
			return "border-primary/30 bg-primary/10 text-primary";
		default:
			return "border-foreground/15 bg-muted text-muted-foreground";
	}
}

export default async function MyEventsPage() {
	const session = await getServerSession();

	if (!session?.user) {
		return (
			<>
				<Hero
					height="short"
					kicker="Your events"
					title="Sign in to see your events."
					subtitle="No password needed - we'll email you a one-click link."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm callbackURL="/my-events" heading="See your events" />
				</Container>
			</>
		);
	}

	const user = session.user;
	const events = await listEventsForHirer(user.id);

	return (
		<>
			<Hero
				height="short"
				kicker="Your events"
				title="Your events"
				subtitle="Ticketed events you're running at The Assembly Rooms."
			/>
			<Container className="pt-6 pb-12 lg:pb-16 space-y-8">
				<OrganiserNav
					current="events"
					email={user.email}
					redirectTo="/my-events"
				/>

				{events.length === 0 ? (
					<div className="rounded-xl border border-foreground/10 bg-card p-10 text-center space-y-4">
						<h2 className="font-display text-2xl tracking-tight">No events yet.</h2>
						<p className="text-muted-foreground max-w-md mx-auto">
							When a booking with ticketing is approved we&apos;ll spin up a draft
							event for you here - that&apos;s where you set ticket types,
							capacity and the public-facing page.
						</p>
						<CtaButton href="/book">Start an enquiry</CtaButton>
					</div>
				) : (
					<ul className="space-y-3">
						{events.map((e) => (
							<li key={e.id}>
								<Link
									href={`/my-events/${e.id}`}
									className="flex items-baseline justify-between gap-4 rounded-lg border border-foreground/10 bg-card p-4 hover:border-foreground/30 transition"
								>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex items-center gap-3 flex-wrap">
											<span className="font-medium truncate">{e.title}</span>
											<span
												className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs capitalize ${eventStatusClass(e.status)}`}
											>
												{e.status.replace("_", " ")}
											</span>
										</div>
										{e.summary && (
											<div className="text-sm text-muted-foreground line-clamp-1">
												{e.summary}
											</div>
										)}
									</div>
									<div className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
										{e.starts_at ? stampFmt.format(new Date(e.starts_at)) : "Date TBA"}
									</div>
								</Link>
							</li>
						))}
					</ul>
				)}
			</Container>
		</>
	);
}
