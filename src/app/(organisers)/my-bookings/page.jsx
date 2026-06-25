import Link from "next/link";
import { listBookingsForUser } from "@/db/queries/bookings";
import { listOrganisationsForUser } from "@/db/queries/user-organisations";
import { Container } from "@/site/ui/container";
import { Hero } from "@/site/ui/hero";
import { CtaButton } from "@/site/ui/cta-button";
import { getServerSession } from "@/utils/auth/server-guard";
import MagicLinkForm from "../_components/magic-link-form";
import MyNav from "@/site/ui/my-nav";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "My bookings - The Assembly Rooms",
};

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

export default async function MyBookingsPage() {
	const session = await getServerSession();

	if (!session?.user) {
		return (
			<>
				<Hero
					height="short"
					kicker="Your bookings"
					title="Sign in to see your bookings."
					subtitle="No password needed - we'll email you a one-click link."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm callbackURL="/my-bookings" heading="See your bookings" />
				</Container>
			</>
		);
	}

	const user = session.user;
	const [bookings, organisations] = await Promise.all([
		listBookingsForUser(user.id),
		listOrganisationsForUser(user.id),
	]);

	return (
		<>
			<Hero
				height="short"
				kicker="Your bookings"
				title="Your bookings"
				subtitle="Enquiries and confirmed hires at The Assembly Rooms."
			/>
			<Container className="pt-6 pb-12 lg:pb-16 space-y-8">
				<MyNav current="bookings" email={user.email} redirectTo="/my-bookings" />

				{organisations.length > 0 && (
					<div className="space-y-3">
						<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-3">
							You&apos;re part of
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

				{bookings.length === 0 ? (
					<div className="rounded-xl border border-foreground/10 bg-card p-10 text-center space-y-4">
						<h2 className="font-display text-2xl tracking-tight">No bookings yet.</h2>
						<p className="text-muted-foreground max-w-md mx-auto">
							Once you submit a hire enquiry you&apos;ll see it here, along with
							payment details and a link to any ticketed event you&apos;re running.
						</p>
						<CtaButton href="/book">Start an enquiry</CtaButton>
					</div>
				) : (
					<ul className="space-y-3">
						{bookings.map((b) => (
							<li key={b.id}>
								<Link
									href={`/my-bookings/${b.id}`}
									className="flex items-baseline justify-between gap-4 rounded-lg border border-foreground/10 bg-card p-4 hover:border-foreground/30 transition"
								>
									<div className="min-w-0 flex-1 space-y-1">
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
										<div className="text-sm text-muted-foreground">
											Submitted{" "}
											{b.submitted_at ? stampFmt.format(new Date(b.submitted_at)) : "-"}
										</div>
									</div>
									<div className="font-mono text-sm shrink-0 whitespace-nowrap">
										{formatGbp(b.total_cents)}
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
