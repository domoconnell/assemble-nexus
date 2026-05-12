import Link from "next/link";
import { listBookingsForUser } from "@/db/queries/bookings";
import { listEventsForHirer } from "@/db/queries/events";
import { listOrganisationsForUser } from "@/db/queries/user-organisations";
import { Container } from "@/site/ui/container";
import { Hero } from "@/site/ui/hero";
import { CtaButton } from "@/site/ui/cta-button";
import { getServerSession } from "@/utils/auth/server-guard";
import MagicLinkForm from "./magic-link-form";
import SignOutButton from "./sign-out-button";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

const stampFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});

function statusClass(status) {
	switch (status) {
		case "pending":
			return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
		case "approved":
		case "confirmed":
			return "border-primary/30 bg-primary/10 text-primary";
		case "rejected":
		case "cancelled":
			return "border-destructive/30 bg-destructive/10 text-destructive";
		default:
			return "border-foreground/15 bg-muted text-muted-foreground";
	}
}

export const metadata = {
	title: "My events — The Assembly Rooms",
};

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

export default async function MyEventsIndexPage() {
	const session = await getServerSession();

	if (!session?.user) {
		return (
			<>
				<Hero
					height="short"
					kicker="Your portal"
					title="Sign in to manage your events."
					subtitle="No password needed — we'll email you a one-click link."
				/>
				<Container className="py-12 lg:py-16">
					<MagicLinkForm callbackURL="/my-events" />
				</Container>
			</>
		);
	}

	const user = session.user;
	const [bookings, events, organisations] = await Promise.all([
		listBookingsForUser(user.id),
		listEventsForHirer(user.id),
		listOrganisationsForUser(user.id),
	]);

	const isEmpty = bookings.length === 0 && events.length === 0;

	return (
		<>
			<Hero
				height="short"
				kicker="Your portal"
				title="Your events"
				subtitle="Manage your bookings and ticketed events at The Assembly Rooms."
			/>
			<Container className="py-12 lg:py-16 space-y-12">
				<div className="flex items-baseline justify-between gap-3 flex-wrap rounded-lg border border-foreground/10 bg-card px-4 py-3 text-sm">
					<div>
						<span className="text-muted-foreground">Signed in as </span>
						<span className="font-medium">{user.email}</span>
					</div>
					<SignOutButton />
				</div>

				{organisations.length > 0 && (
					<div className="space-y-3">
						<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-4">
							You're part of
						</h2>
						<div className="flex flex-wrap gap-2">
							{organisations.map((o) => (
								<span
									key={o.id}
									className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-card px-3 py-1.5 text-sm"
								>
									<span className="font-medium">{o.name}</span>
									<span className="text-xs text-muted-foreground capitalize">
										{o.role.replace("_", " ")}
									</span>
								</span>
							))}
						</div>
					</div>
				)}

				{events.length > 0 && (
					<div className="space-y-3">
						<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-4">
							Events
						</h2>
						<ul className="space-y-3">
							{events.map((e) => (
								<li key={e.id}>
									<Link
										href={`/my-events/${e.id}/edit`}
										className="flex items-baseline justify-between gap-4 rounded-lg border border-foreground/10 bg-card p-4 hover:border-foreground/30 transition"
									>
										<div className="min-w-0">
											<div className="flex items-center gap-3 flex-wrap">
												<span className="font-medium truncate">{e.title}</span>
												<span
													className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs capitalize ${eventStatusClass(e.status)}`}
												>
													{e.status.replace("_", " ")}
												</span>
												{e.is_ticketed && (
													<span className="inline-flex items-center rounded-full border border-foreground/15 bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
														Ticketing
													</span>
												)}
											</div>
											{e.summary && (
												<div className="mt-1 text-sm text-muted-foreground line-clamp-1">
													{e.summary}
												</div>
											)}
										</div>
										<div className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
											{e.starts_at
												? stampFmt.format(new Date(e.starts_at))
												: "Date TBA"}
										</div>
									</Link>
								</li>
							))}
						</ul>
					</div>
				)}

				{isEmpty ? (
					<div className="rounded-xl border border-foreground/10 bg-card p-10 text-center space-y-4">
						<h2 className="font-display text-2xl tracking-tight">No bookings yet.</h2>
						<p className="text-muted-foreground max-w-md mx-auto">
							Once you submit a hire enquiry you&apos;ll see it here, along with the option to
							set up ticketing for any event you&apos;re running.
						</p>
						<CtaButton href="/book">Start an enquiry</CtaButton>
					</div>
				) : bookings.length === 0 ? null : (
					<div className="space-y-3">
						<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-4">
							Bookings
						</h2>
						<ul className="space-y-3">
							{bookings.map((b) => (
								<li key={b.id}>
									<Link
										href={`/my-events/bookings/${b.id}`}
										className="flex items-baseline justify-between gap-4 rounded-lg border border-foreground/10 bg-card p-4 hover:border-foreground/30 transition"
									>
										<div className="min-w-0">
											<div className="flex items-center gap-3 flex-wrap">
												<span className="font-mono text-xs text-muted-foreground">
													{b.reference}
												</span>
												<span
													className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${statusClass(b.status)}`}
												>
													{b.status}
												</span>
												{b.ticketing_enabled && (
													<span className="inline-flex items-center rounded-full border border-foreground/15 bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
														Ticketing
													</span>
												)}
											</div>
											<div className="mt-1 text-sm text-muted-foreground">
												Submitted {b.submitted_at ? stampFmt.format(new Date(b.submitted_at)) : "—"}
											</div>
										</div>
										<div className="font-mono text-sm shrink-0 whitespace-nowrap">
											{formatGbp(b.total_cents)}
										</div>
									</Link>
								</li>
							))}
						</ul>
					</div>
				)}
			</Container>
		</>
	);
}
