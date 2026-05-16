import Link from "next/link";
import { notFound } from "next/navigation";
import {
	getEventById,
	userCanEditEvent,
	listTicketTypes,
	countEventTickets,
} from "@/db/queries/events";
import { listOrdersForEvent } from "@/db/queries/orders";
import { Container } from "@/site/ui/container";
import { Hero } from "@/site/ui/hero";
import { getServerSession } from "@/utils/auth/server-guard";
import MagicLinkForm from "../../_components/magic-link-form";
import OrganiserNav from "../../_components/organiser-nav";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "Europe/London",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});
const stampFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

function statusClass(status) {
	switch (status) {
		case "draft":
			return "border-foreground/15 bg-muted text-muted-foreground";
		case "pending_review":
			return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
		case "published":
			return "border-primary/30 bg-primary/10 text-primary";
		case "cancelled":
			return "border-destructive/30 bg-destructive/10 text-destructive";
		default:
			return "border-foreground/15 bg-muted text-muted-foreground";
	}
}

function orderStatusClass(status) {
	switch (status) {
		case "pending":
			return "text-amber-600 dark:text-amber-400";
		case "paid":
			return "text-primary";
		case "cancelled":
		case "refunded":
		case "partially_refunded":
			return "text-destructive";
		default:
			return "text-muted-foreground";
	}
}

export async function generateMetadata({ params }) {
	const { id } = await params;
	const ev = await getEventById(id);
	return {
		title: ev ? `${ev.title} - The Assembly Rooms` : "Event - The Assembly Rooms",
		robots: { index: false, follow: false },
	};
}

export default async function MyEventDetailPage({ params }) {
	const { id } = await params;
	const session = await getServerSession();

	if (!session?.user) {
		return (
			<>
				<Hero
					height="short"
					kicker="Your event"
					title="Sign in to see this event."
					subtitle="No password needed - we'll email you a one-click link."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm
						callbackURL={`/my-events/${id}`}
						heading="See your event"
					/>
				</Container>
			</>
		);
	}

	const ev = await getEventById(id);
	if (!ev) notFound();

	const canEdit = await userCanEditEvent(session.user.id, ev.id);
	if (!canEdit) notFound();

	const [ticketCounts, ticketTypes, orders] = await Promise.all([
		countEventTickets(ev.id),
		listTicketTypes(ev.id),
		listOrdersForEvent(ev.id),
	]);

	const paidOrders = orders.filter(
		(o) => o.status === "paid" || o.status === "partially_refunded",
	);
	const grossCents = paidOrders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);
	const organiserNetCents = paidOrders.reduce(
		(sum, o) => sum + (o.organiser_net_cents ?? 0),
		0,
	);
	const bookingFeesCents = paidOrders.reduce(
		(sum, o) => sum + (o.booking_fee_cents ?? 0),
		0,
	);
	const totalDelegates = paidOrders.reduce(
		(sum, o) => sum + (o.delegate_count ?? 0),
		0,
	);

	const start = ev.starts_at ? new Date(ev.starts_at) : null;
	const end = ev.ends_at ? new Date(ev.ends_at) : null;

	return (
		<>
			<Hero
				height="short"
				kicker="Your event"
				title={ev.title}
				subtitle={
					start
						? `${dateFmt.format(start)}${end ? ` · ${timeFmt.format(start)}–${timeFmt.format(end)}` : ""}`
						: undefined
				}
			/>
			<Container className="pt-6 pb-12 lg:pb-16 space-y-6">
				<OrganiserNav
					current="events"
					email={session.user.email}
					redirectTo="/my-events"
				/>

				<div className="flex items-center gap-3 flex-wrap">
					<span
						className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs capitalize ${statusClass(ev.status)}`}
					>
						{ev.status.replace("_", " ")}
					</span>
					<Link
						href={`/my-events/${ev.id}/edit`}
						className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-foreground/15 px-3 py-1.5 text-xs hover:border-foreground/30 hover:bg-foreground/5 transition"
					>
						Edit event
					</Link>
				</div>

				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<Stat label="Tickets sold" value={ticketCounts.total} sub={`${ticketCounts.used} used`} />
					<Stat label="Delegates" value={totalDelegates} />
					<Stat
						label="Your earnings"
						value={formatGbp(organiserNetCents)}
						sub="What you'll receive"
					/>
					<Stat
						label="Customer total"
						value={formatGbp(grossCents)}
						sub={
							bookingFeesCents > 0
								? `${formatGbp(bookingFeesCents)} in venue fees`
								: undefined
						}
					/>
				</div>

				<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-3">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Ticket types ({ticketTypes.length})
					</h2>
					{ticketTypes.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							You haven&apos;t set any ticket types yet.{" "}
							<Link
								href={`/my-events/${ev.id}/edit`}
								className="text-primary hover:underline"
							>
								Add some →
							</Link>
						</p>
					) : (
						<ul className="space-y-2 text-sm">
							{ticketTypes.map((t) => (
								<li
									key={t.id}
									className="flex items-baseline justify-between gap-4 border-t border-foreground/10 pt-2 first:border-t-0 first:pt-0"
								>
									<div>
										<div className="font-medium">{t.name}</div>
										{t.description && (
											<div className="text-xs text-muted-foreground line-clamp-1">
												{t.description}
											</div>
										)}
									</div>
									<div className="font-mono text-sm text-muted-foreground shrink-0">
										{formatGbp(t.price_cents)}
										{t.max_quantity ? ` · cap ${t.max_quantity}` : ""}
									</div>
								</li>
							))}
						</ul>
					)}
				</section>

				<section className="space-y-3">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Orders ({orders.length})
					</h2>
					{orders.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No orders yet - once tickets are sold they&apos;ll show up here.
						</p>
					) : (
						<ul className="space-y-2">
							{orders.map((o) => {
								const isPaid =
									o.status === "paid" || o.status === "partially_refunded";
								return (
								<li
									key={o.id}
									className="flex items-baseline justify-between gap-4 rounded-lg border border-foreground/10 bg-card p-4"
								>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex items-baseline gap-3 flex-wrap">
											<span className="font-medium truncate">
												{o.customer_first_name} {o.customer_last_name}
											</span>
											<span className="font-mono text-xs text-muted-foreground">
												{o.reference}
											</span>
											<span className={`text-xs capitalize ${orderStatusClass(o.status)}`}>
												{o.status.replace("_", " ")}
											</span>
										</div>
										<div className="text-xs text-muted-foreground">
											{o.customer_email} ·{" "}
											{o.delegate_count}{" "}
											{o.delegate_count === 1 ? "delegate" : "delegates"} ·{" "}
											{stampFmt.format(new Date(o.createdAt))}
										</div>
									</div>
									<div className="text-right shrink-0 space-y-0.5">
										<div className="font-mono text-sm">
											{isPaid ? formatGbp(o.organiser_net_cents) : "-"}
										</div>
										<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
											{isPaid ? "Your earnings" : "Pending"}
										</div>
									</div>
								</li>
								);
							})}
						</ul>
					)}
				</section>
			</Container>
		</>
	);
}

function Stat({ label, value, sub }) {
	return (
		<div className="rounded-lg border border-foreground/10 bg-card p-4">
			<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
				{label}
			</div>
			<div className="font-display text-2xl tracking-tight mt-1">{value}</div>
			{sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
		</div>
	);
}
