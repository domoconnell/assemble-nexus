import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/site/ui/container";
import { Hero } from "@/site/ui/hero";
import { getServerSession } from "@/utils/auth/server-guard";
import {
	getOrderByReference,
	getOrderForUserByReference,
	listOrderLines,
	listOrderTickets,
} from "@/db/queries/orders";
import { listBookingsForUser } from "@/db/queries/bookings";
import { listEventsForHirer } from "@/db/queries/events";
import MagicLinkForm from "../../_components/magic-link-form";
import MyNav from "@/site/ui/my-nav";

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

function ticketStatusClass(status) {
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

function orderStatusClass(status) {
	switch (status) {
		case "pending":
			return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
		case "paid":
			return "border-primary/30 bg-primary/10 text-primary";
		case "cancelled":
		case "refunded":
		case "partially_refunded":
			return "border-destructive/30 bg-destructive/10 text-destructive";
		default:
			return "border-foreground/15 bg-muted text-muted-foreground";
	}
}

export async function generateMetadata({ params }) {
	const { reference } = await params;
	return {
		title: `Order ${reference} - The Assembly Rooms`,
		robots: { index: false, follow: false },
	};
}

export default async function MyOrderDetailPage({ params }) {
	const { reference } = await params;
	const session = await getServerSession();

	if (!session?.user) {
		return (
			<>
				<Hero
					height="short"
					kicker="Your order"
					title="Sign in to see this order."
					subtitle="No password needed - we'll email you a one-click link."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm
						callbackURL={`/my-orders/${reference}`}
						heading="See your order"
					/>
				</Container>
			</>
		);
	}

	const order = await getOrderForUserByReference(reference, session.user.id);
	if (!order) {
		// Order may exist but be tied to a different user (common right after a
		// purchase made while signed in as someone else - admin testing,
		// shared device, etc.). Surface a magic-link prompt rather than 404.
		const publicOrder = await getOrderByReference(reference);
		if (!publicOrder) notFound();
		return (
			<>
				<Hero
					height="short"
					kicker="Your order"
					title="Sign in as the buyer to see this order."
					subtitle="The order is held against a different email. Sign in with the email you used to buy."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm
						callbackURL={`/my-orders/${reference}`}
						heading={`Sign in as ${publicOrder.customer_email}`}
						body="Pop the email you used at checkout in - we'll send a one-click sign-in link."
					/>
				</Container>
			</>
		);
	}

	const [lines, tickets, bookings, events] = await Promise.all([
		listOrderLines(order.id),
		listOrderTickets(order.id),
		listBookingsForUser(session.user.id),
		listEventsForHirer(session.user.id),
	]);

	const ticketLines = lines.filter((l) => l.kind === "ticket" && !l.parent_line_id);
	const bundleLines = lines.filter((l) => l.kind === "bundle");
	const addonLines = lines.filter((l) => l.kind === "addon");
	const discountLines = lines.filter((l) => l.kind === "discount");

	const eventDate = order.event_starts_at ? new Date(order.event_starts_at) : null;
	const eventEnd = order.event_ends_at ? new Date(order.event_ends_at) : null;

	return (
		<>
			<Hero
				height="short"
				kicker="Your order"
				title={order.event_title}
				subtitle={
					eventDate
						? `${dateFmt.format(eventDate)}${eventEnd ? ` · ${timeFmt.format(eventDate)} - ${timeFmt.format(eventEnd)}` : ""}`
						: undefined
				}
			/>

			<Container className="pt-6 pb-12 lg:pb-16 space-y-6 max-w-3xl">
				<MyNav
					current="orders"
					email={session.user.email}
					redirectTo="/my-orders"
					showBookings={bookings.length > 0}
					showEvents={events.length > 0}
				/>

				<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-4">
					<div className="flex items-baseline justify-between gap-3 flex-wrap">
						<div>
							<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
								Reference
							</div>
							<div className="font-mono mt-1">{order.reference}</div>
						</div>
						<span
							className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs capitalize ${orderStatusClass(order.status)}`}
						>
							{order.status.replace("_", " ")}
						</span>
					</div>

					<dl className="space-y-1 text-sm border-t border-foreground/10 pt-4">
						{ticketLines.map((l) => (
							<Row
								key={l.id}
								label={`${l.name_snapshot}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`}
								value={formatGbp(l.line_total_cents)}
							/>
						))}
						{bundleLines.map((l) => (
							<Row
								key={l.id}
								label={`${l.name_snapshot}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`}
								value={formatGbp(l.line_total_cents)}
							/>
						))}
						{addonLines.map((l) => (
							<Row
								key={l.id}
								label={`${l.name_snapshot}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`}
								value={formatGbp(l.line_total_cents)}
								muted
							/>
						))}
						{discountLines.map((l) => (
							<Row
								key={l.id}
								label={l.name_snapshot}
								value={`−${formatGbp(Math.abs(l.line_total_cents))}`}
								discount
							/>
						))}
						{order.vat_cents > 0 && (
							<Row label="VAT" value={formatGbp(order.vat_cents)} muted />
						)}
						<div className="border-t border-foreground/10 pt-2 mt-2">
							<Row label="Total paid" value={formatGbp(order.total_cents)} bold />
						</div>
					</dl>
					<div className="pt-2 flex justify-end">
						<a
							href={`/api/orders/${order.reference}/invoice`}
							className="inline-flex items-center gap-1.5 rounded-md border border-foreground/15 px-3 py-1.5 text-xs hover:border-foreground/30 hover:bg-foreground/5 transition"
						>
							Download invoice
						</a>
					</div>
				</section>

				<section className="space-y-3">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Tickets ({tickets.length})
					</h2>
					<p className="text-sm text-muted-foreground">
						Tap a ticket for the QR code at the door, plus PDF and wallet downloads.
					</p>
					<ul className="space-y-2">
						{tickets.map((t) => (
							<li key={t.id}>
								<Link
									href={`/my-tickets/${t.code}`}
									className="flex items-baseline justify-between gap-4 rounded-lg border border-foreground/10 bg-card p-4 hover:border-foreground/30 transition"
								>
									<div className="min-w-0">
										<div className="flex items-center gap-3 flex-wrap">
											<span className="font-medium truncate">
												{t.line_name_snapshot}
											</span>
											<span
												className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${ticketStatusClass(t.status)}`}
											>
												{t.status}
											</span>
										</div>
										<div className="mt-1 text-xs text-muted-foreground font-mono">
											{t.code}
										</div>
									</div>
									<span className="text-xs text-muted-foreground shrink-0">View →</span>
								</Link>
							</li>
						))}
					</ul>
				</section>

			</Container>
		</>
	);
}

function Row({ label, value, muted, bold, discount }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className={muted ? "text-muted-foreground" : bold ? "font-medium" : ""}>{label}</dt>
			<dd className={`font-mono ${bold ? "font-medium" : ""} ${discount ? "text-primary" : ""}`}>
				{value}
			</dd>
		</div>
	);
}
