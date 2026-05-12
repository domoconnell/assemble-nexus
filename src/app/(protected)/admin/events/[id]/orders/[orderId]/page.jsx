import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import {
	listOrderLines,
	listOrderTickets,
	getSucceededIntentForOrder,
	getPendingIntentForOrder,
} from "@/db/queries/orders";
import { getTicketingSettings } from "@/db/queries/settings";
import { customer } from "@/db/schema/entities/customer.js";
import { event } from "@/db/schema/entities/event.js";
import OrderRefundActions from "../../../_components/order-refund-actions";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

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

export default async function AdminOrderDetailPage({ params }) {
	const { id, orderId } = await params;

	const [row] = await db
		.select({
			id: ticket_order.id,
			reference: ticket_order.reference,
			event_id: ticket_order.event_id,
			status: ticket_order.status,
			subtotal_cents: ticket_order.subtotal_cents,
			discount_cents: ticket_order.discount_cents,
			vat_cents: ticket_order.vat_cents,
			total_cents: ticket_order.total_cents,
			booking_fee_cents: ticket_order.booking_fee_cents,
			booking_fee_borne_by: ticket_order.booking_fee_borne_by,
			createdAt: ticket_order.createdAt,
			paid_at: ticket_order.paid_at,
			cancelled_at: ticket_order.cancelled_at,
			customer_first_name: customer.first_name,
			customer_last_name: customer.last_name,
			customer_email: customer.email,
			customer_phone: customer.phone,
			event_title: event.title,
			event_slug: event.slug,
			venue_id: event.venue_id,
		})
		.from(ticket_order)
		.innerJoin(customer, eq(ticket_order.customer_id, customer.id))
		.innerJoin(event, eq(ticket_order.event_id, event.id))
		.where(eq(ticket_order.id, orderId))
		.limit(1);
	if (!row || row.event_id !== id) notFound();

	const [lines, tickets, succeededIntent, pendingIntent] = await Promise.all([
		listOrderLines(row.id),
		listOrderTickets(row.id),
		getSucceededIntentForOrder(row.id),
		getPendingIntentForOrder(row.id),
	]);

	const ticketLines = lines.filter((l) => l.kind === "ticket" && !l.parent_line_id);
	const bundleLines = lines.filter((l) => l.kind === "bundle");
	const addonLines = lines.filter((l) => l.kind === "addon");
	const discountLines = lines.filter((l) => l.kind === "discount");

	const delegateCount = lines
		.filter((l) => l.kind === "ticket")
		.reduce((s, l) => s + (l.quantity ?? 0), 0);
	const validTickets = tickets.filter((t) => t.status === "valid").length;
	const usedTickets = tickets.filter((t) => t.status === "used").length;
	const voidTickets = tickets.filter((t) => t.status !== "valid").length;

	// Resolve booking fee for display. Use the stored snapshot when present;
	// otherwise project from current ticketing settings (older orders predate the
	// snapshot column, but the user still expects to see the organiser's net).
	const ticketingSettings = await getTicketingSettings(row.venue_id);
	const orderValue = row.subtotal_cents + row.vat_cents;
	let feeCents = row.booking_fee_cents ?? 0;
	let feeIsEstimate = false;
	if (
		feeCents === 0 &&
		(row.status === "paid" || row.status === "partially_refunded") &&
		ticketingSettings
	) {
		const pct = ticketingSettings.platform_fee_pct_x100 ?? 0;
		const flat = ticketingSettings.platform_fee_flat_cents ?? 0;
		if (orderValue > 0 && (pct > 0 || flat > 0)) {
			feeCents = Math.round((orderValue * pct) / 10000) + flat;
			feeIsEstimate = true;
		}
	}
	const organiserPaidFee = row.booking_fee_borne_by !== "customer";
	const organiserReceives = organiserPaidFee ? orderValue - feeCents : orderValue;

	const activeIntent = succeededIntent ?? pendingIntent;
	const canRefund = row.status === "paid" || row.status === "partially_refunded";

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div>
				<Link
					href={`/admin/events/${row.event_id}`}
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← {row.event_title}
				</Link>
				<div className="mt-2 flex items-center gap-3 flex-wrap">
					<h1 className="text-2xl font-semibold font-mono">{row.reference}</h1>
					<span
						className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs capitalize ${statusClass(row.status)}`}
					>
						{row.status.replace("_", " ")}
					</span>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					Placed {stampFmt.format(new Date(row.createdAt))}
					{row.paid_at && ` · Paid ${stampFmt.format(new Date(row.paid_at))}`}
				</p>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
				<div className="space-y-6">
					<section className="rounded-lg border bg-card p-6 space-y-3">
						<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							Buyer
						</h2>
						<div className="text-sm">
							<div>
								{row.customer_first_name} {row.customer_last_name}
							</div>
							<div className="text-muted-foreground">
								<a className="hover:underline" href={`mailto:${row.customer_email}`}>
									{row.customer_email}
								</a>
								{row.customer_phone && ` · ${row.customer_phone}`}
							</div>
						</div>
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-4">
						<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							Line items
						</h2>
						<ul className="divide-y divide-foreground/10 text-sm">
							{ticketLines.map((l) => (
								<li key={l.id} className="py-2 flex items-baseline justify-between gap-3">
									<span>
										{l.name_snapshot}
										{l.quantity > 1 ? ` × ${l.quantity}` : ""}
									</span>
									<span className="font-mono">{formatGbp(l.line_total_cents)}</span>
								</li>
							))}
							{bundleLines.map((l) => (
								<li key={l.id} className="py-2 flex items-baseline justify-between gap-3">
									<span>
										{l.name_snapshot}
										<span className="text-primary text-xs ml-2">bundle</span>
									</span>
									<span className="font-mono">{formatGbp(l.line_total_cents)}</span>
								</li>
							))}
							{addonLines.map((l) => (
								<li
									key={l.id}
									className="py-2 flex items-baseline justify-between gap-3 text-muted-foreground"
								>
									<span>
										+ {l.name_snapshot}
										{l.quantity > 1 ? ` × ${l.quantity}` : ""}
									</span>
									<span className="font-mono">{formatGbp(l.line_total_cents)}</span>
								</li>
							))}
							{discountLines.map((l) => (
								<li
									key={l.id}
									className="py-2 flex items-baseline justify-between gap-3 text-primary"
								>
									<span>{l.name_snapshot}</span>
									<span className="font-mono">{formatGbp(l.line_total_cents)}</span>
								</li>
							))}
						</ul>
					</section>

					{tickets.length > 0 && (
						<section className="rounded-lg border bg-card p-6 space-y-3">
							<div className="flex items-baseline justify-between gap-3 flex-wrap">
								<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
									Tickets
								</h2>
								<div className="text-xs text-muted-foreground">
									{validTickets} valid
									{usedTickets > 0 && ` · ${usedTickets} used`}
									{voidTickets > 0 && ` · ${voidTickets} void`}
								</div>
							</div>
							<ul className="divide-y divide-foreground/10 text-sm">
								{tickets.map((t) => (
									<li
										key={t.id}
										className="py-2 flex items-baseline justify-between gap-3"
									>
										<span>{t.line_name_snapshot}</span>
										<span className="font-mono text-xs">
											{t.code}
											{t.status !== "valid" && (
												<span className="ml-2 text-destructive capitalize">
													{t.status}
												</span>
											)}
										</span>
									</li>
								))}
							</ul>
						</section>
					)}
				</div>

				<aside className="space-y-6">
					<section className="rounded-lg border border-primary/30 bg-primary/5 p-6 space-y-3">
						<h2 className="text-xs uppercase tracking-[0.22em] text-primary">Total paid</h2>
						<div className="font-display text-3xl tracking-tight">
							{formatGbp(row.total_cents)}
						</div>
						<dl className="space-y-1 text-sm pt-3 border-t border-foreground/10">
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Subtotal</dt>
								<dd className="font-mono">{formatGbp(row.subtotal_cents)}</dd>
							</div>
							{row.vat_cents > 0 && (
								<div className="flex justify-between">
									<dt className="text-muted-foreground">VAT</dt>
									<dd className="font-mono">{formatGbp(row.vat_cents)}</dd>
								</div>
							)}
							{row.discount_cents !== 0 && (
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Discounts</dt>
									<dd className="font-mono">{formatGbp(row.discount_cents)}</dd>
								</div>
							)}
							{feeCents > 0 && (
								<div className="flex justify-between">
									<dt className="text-muted-foreground">
										Booking fee ({organiserPaidFee ? "absorbed" : "added"})
										{feeIsEstimate && (
											<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 ml-1">
												est.
											</span>
										)}
									</dt>
									<dd className="font-mono">
										{organiserPaidFee ? "−" : ""}
										{formatGbp(feeCents)}
									</dd>
								</div>
							)}
						</dl>
						<div className="pt-3 border-t border-foreground/10 text-sm">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Organiser receives</span>
								<span className="font-mono">{formatGbp(organiserReceives)}</span>
							</div>
						</div>
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-3">
						<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							Delegates
						</h2>
						<div className="font-display text-2xl">{delegateCount}</div>
						<p className="text-xs text-muted-foreground">
							Total people admitted by this order (sum of each ticket type&apos;s admits-per-ticket).
						</p>
					</section>

					{activeIntent && (
						<section className="rounded-lg border bg-card p-6 space-y-4">
							<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
								Payment
							</h2>
							<dl className="space-y-3 text-sm">
								<div>
									<dt className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
										Provider
									</dt>
									<dd className="mt-1 capitalize">{activeIntent.provider}</dd>
								</div>
								<div>
									<dt className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
										Transaction ref
									</dt>
									<dd className="mt-1 font-mono text-xs break-all">
										{activeIntent.external_id}
									</dd>
								</div>
								<div>
									<dt className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
										Status
									</dt>
									<dd className="mt-1 capitalize">
										{activeIntent.status.replace("_", " ")}
									</dd>
								</div>
							</dl>
						</section>
					)}

					{canRefund && <OrderRefundActions order={row} />}
				</aside>
			</div>
		</div>
	);
}
