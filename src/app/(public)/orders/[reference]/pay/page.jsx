import { notFound, redirect } from "next/navigation";
import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { Container } from "@/site/ui/container";
import {
	getOrderByReference,
	listOrderLines,
	getPendingIntentForOrder,
	getSucceededIntentForOrder,
} from "@/db/queries/orders";
import { getActivePsp } from "@/lib/psp/index.js";
import { requireCurrentVenue } from "@/db/queries/venue";
import TicketPaymentPanel from "@/site/events/ticket-payment-panel";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

export async function generateMetadata({ params }) {
	const { reference } = await params;
	return {
		title: `Pay · ${reference} - The Assembly Rooms`,
		robots: { index: false, follow: false },
	};
}

export default async function TicketOrderPayPage({ params }) {
	const { reference } = await params;
	const order = await getOrderByReference(reference);
	if (!order) notFound();

	// Already paid (or beyond) - kick over to the delegate portal page.
	if (order.status === "paid" || order.status === "partially_refunded") {
		redirect(`/my-orders/${reference}`);
	}
	if (order.status === "cancelled" || order.status === "refunded") {
		redirect(`/my-orders/${reference}`);
	}

	const venue = await requireCurrentVenue();
	const [lines, pending, succeeded] = await Promise.all([
		listOrderLines(order.id),
		getPendingIntentForOrder(order.id),
		getSucceededIntentForOrder(order.id),
	]);

	if (succeeded) {
		// Defensive - payment landed but status didn't flip yet.
		redirect(`/my-orders/${reference}`);
	}

	if (!pending) {
		// No active intent - fall back to the order detail page so the user can
		// see status; we don't currently auto-create a new intent here.
		redirect(`/my-orders/${reference}`);
	}

	const psp = await getActivePsp(venue.id);
	let clientSecret = null;
	if (psp.key === "stripe" && psp.retrievePaymentIntent) {
		const intent = await psp.retrievePaymentIntent(pending.external_id, { withSecret: true });
		clientSecret = intent?.client_secret ?? null;
	}

	const ticketLines = lines.filter((l) => l.kind === "ticket" && !l.parent_line_id);
	const bundleLines = lines.filter((l) => l.kind === "bundle");
	const addonLines = lines.filter((l) => l.kind === "addon");
	const discountLines = lines.filter((l) => l.kind === "discount");

	return (
		<>
			<Hero
				height="short"
				kicker="Payment"
				title={`Pay for ${order.event_title}`}
				subtitle="Enter your card details to confirm your tickets."
			>
				<div className="mt-2 text-sm text-foreground/70 font-mono">
					{order.reference}
				</div>
			</Hero>

			<Section>
				<Container>
					<div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
						<div className="space-y-6">
							<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-3">
								<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
									Order
								</h2>
								<ul className="divide-y divide-foreground/10 text-sm">
									{ticketLines.map((l) => (
										<li
											key={l.id}
											className="py-2 flex items-baseline justify-between gap-3"
										>
											<span>
												{l.name_snapshot}
												{l.quantity > 1 ? ` × ${l.quantity}` : ""}
											</span>
											<span className="font-mono">{formatGbp(l.line_total_cents)}</span>
										</li>
									))}
									{bundleLines.map((l) => (
										<li
											key={l.id}
											className="py-2 flex items-baseline justify-between gap-3"
										>
											<span>
												{l.name_snapshot}{" "}
												<span className="text-primary text-xs">bundle</span>
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

							<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-3">
								<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
									You&apos;ll pay
								</h2>
								<dl className="space-y-1 text-sm">
									<div className="flex items-baseline justify-between gap-3">
										<dt className="text-muted-foreground">Subtotal</dt>
										<dd className="font-mono">
											{formatGbp(order.subtotal_cents)}
										</dd>
									</div>
									{order.vat_cents > 0 && (
										<div className="flex items-baseline justify-between gap-3">
											<dt className="text-muted-foreground">VAT</dt>
											<dd className="font-mono">{formatGbp(order.vat_cents)}</dd>
										</div>
									)}
									{order.discount_cents !== 0 && (
										<div className="flex items-baseline justify-between gap-3 text-primary">
											<dt>Discount</dt>
											<dd className="font-mono">{formatGbp(order.discount_cents)}</dd>
										</div>
									)}
									<div className="flex items-baseline justify-between gap-3 pt-2 border-t border-foreground/10">
										<dt className="font-medium">Total due now</dt>
										<dd className="font-display text-2xl">
											{formatGbp(order.total_cents)}
										</dd>
									</div>
								</dl>
							</section>
						</div>

						<aside className="space-y-6 lg:sticky lg:top-28 self-start">
							<TicketPaymentPanel
								orderReference={order.reference}
								totalCents={order.total_cents}
								provider={psp.key}
								intentId={pending.external_id}
								clientSecret={clientSecret}
								publishableKey={psp.publishableKey ?? null}
							/>
						</aside>
					</div>
				</Container>
			</Section>
		</>
	);
}
