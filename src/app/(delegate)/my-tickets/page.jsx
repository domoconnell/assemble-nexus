import Link from "next/link";
import { Container } from "@/site/ui/container";
import { Hero } from "@/site/ui/hero";
import { CtaButton } from "@/site/ui/cta-button";
import { getServerSession } from "@/utils/auth/server-guard";
import { listTicketsForUser } from "@/db/queries/orders";
import MagicLinkForm from "../_components/magic-link-form";
import DelegateNav from "../_components/delegate-nav";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "My tickets — The Assembly Rooms",
};

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

function statusClass(status) {
	switch (status) {
		case "valid":
			return "border-primary/30 bg-primary/10 text-primary";
		case "used":
			return "border-foreground/15 bg-muted text-muted-foreground";
		case "refunded":
		case "void":
			return "border-destructive/30 bg-destructive/10 text-destructive";
		default:
			return "border-foreground/15 bg-muted text-muted-foreground";
	}
}

export default async function MyTicketsPage() {
	const session = await getServerSession();

	if (!session?.user) {
		return (
			<>
				<Hero
					height="short"
					kicker="Your tickets"
					title="Sign in to see your tickets."
					subtitle="No password needed — we'll email you a one-click link."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm
						callbackURL="/my-tickets"
						heading="See your tickets"
					/>
				</Container>
			</>
		);
	}

	const user = session.user;
	const allTickets = await listTicketsForUser(user.id);

	// Split into active (event is today or in the future) vs previous.
	const now = Date.now();
	const todayStart = new Date(new Date().toDateString()).getTime();
	const active = [];
	const previous = [];
	for (const t of allTickets) {
		const start = t.event_starts_at ? new Date(t.event_starts_at).getTime() : null;
		if (start == null || start >= todayStart) active.push(t);
		else previous.push(t);
	}
	active.sort((a, b) =>
		new Date(a.event_starts_at).getTime() - new Date(b.event_starts_at).getTime(),
	);
	previous.sort((a, b) =>
		new Date(b.event_starts_at).getTime() - new Date(a.event_starts_at).getTime(),
	);

	return (
		<>
			<Hero
				height="short"
				kicker="Your tickets"
				title="Your tickets"
				subtitle="Tap any ticket for the QR code at the door."
			/>
			<Container className="pt-6 pb-12 lg:pb-16 space-y-8">
				<DelegateNav current="tickets" email={user.email} redirectTo="/my-tickets" />

				{allTickets.length === 0 ? (
					<div className="rounded-xl border border-foreground/10 bg-card p-10 text-center space-y-4">
						<h2 className="font-display text-2xl tracking-tight">No tickets yet.</h2>
						<p className="text-muted-foreground max-w-md mx-auto">
							Tickets you buy for events at The Assembly Rooms will appear here.
						</p>
						<CtaButton href="/whats-on">Browse what&apos;s on</CtaButton>
					</div>
				) : (
					<>
						<TicketSection tickets={active} emptyMessage="No upcoming tickets." />
						{previous.length > 0 && (
							<TicketSection title="Past events" tickets={previous} muted />
						)}
					</>
				)}
			</Container>
		</>
	);
}

function TicketSection({ title, tickets, emptyMessage, muted = false }) {
	return (
		<section className="space-y-3">
			{title && (
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{title}</h2>
			)}
			{tickets.length === 0 ? (
				<p className="text-sm text-muted-foreground">{emptyMessage}</p>
			) : (
				<ul className="space-y-2">
					{tickets.map((t) => {
						const date = t.event_starts_at ? new Date(t.event_starts_at) : null;
						return (
							<li key={t.id}>
								<Link
									href={`/my-tickets/${t.code}`}
									className={`flex items-baseline justify-between gap-4 rounded-lg border bg-card p-4 hover:border-foreground/30 transition ${
										muted ? "opacity-80 border-foreground/5" : "border-foreground/10"
									}`}
								>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex items-center gap-3 flex-wrap">
											<span className="font-medium truncate">{t.ticket_type_label}</span>
											<span
												className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${statusClass(t.status)}`}
											>
												{t.status}
											</span>
										</div>
										<div className="text-sm text-foreground/85">{t.event_title}</div>
										{date && (
											<div className="text-xs text-muted-foreground">
												{dateFmt.format(date)} · {timeFmt.format(date)}
											</div>
										)}
										<div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
											<span>
												<span className="uppercase tracking-[0.18em]">Ticket </span>
												<span className="font-mono">{t.code}</span>
											</span>
											<span>
												<span className="uppercase tracking-[0.18em]">Order </span>
												<span className="font-mono">{t.order_reference}</span>
											</span>
										</div>
									</div>
									<span className="text-xs text-muted-foreground shrink-0">View →</span>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
