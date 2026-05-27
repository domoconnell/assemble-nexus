import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { Container } from "@/site/ui/container";
import {
	getBookingByReference,
	getPendingIntentForBooking,
} from "@/db/queries/bookings";
import { getActivePsp } from "@/lib/psp/index.js";
import BookingDepositPanel from "@/site/booking/booking-deposit-panel";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

export async function generateMetadata({ params }) {
	const { reference } = await params;
	return { title: `Pay deposit · ${reference} - The Assembly Rooms` };
}

export default async function BookingPayPage({ params }) {
	const { reference } = await params;
	const b = await getBookingByReference(reference);
	if (!b) notFound();

	if (b.status === "confirmed" || b.status === "completed") {
		// Already paid - kick back to the status page so they see confirmation.
		redirect(`/booking/${reference}`);
	}
	if (b.status !== "approved") {
		// Pending / rejected / cancelled - show status page only.
		redirect(`/booking/${reference}`);
	}
	if ((b.deposit_required_cents ?? 0) <= 0) {
		redirect(`/booking/${reference}`);
	}

	const pending = await getPendingIntentForBooking(b.id);
	let pspKey = null;
	let publishableKey = null;
	let clientSecret = null;
	if (pending) {
		const psp = await getActivePsp(b.venue_id);
		pspKey = psp.key;
		publishableKey = psp.publishableKey ?? null;
		// For Stripe, the browser needs the client_secret to mount Elements
		// against the pending intent. We pull it back through the driver.
		if (psp.key === "stripe" && psp.retrievePaymentIntent) {
			const intent = await psp.retrievePaymentIntent(pending.external_id, { withSecret: true });
			clientSecret = intent?.client_secret ?? null;
		}
	}

	const balanceDue = Math.max(0, (b.total_cents ?? 0) - (b.deposit_required_cents ?? 0));

	return (
		<>
			<Hero
				height="short"
				kicker="Deposit"
				title="Confirm your booking with a deposit."
				subtitle="Once the deposit lands, your room hire is confirmed. We'll send a confirmation by email."
			>
				<div className="mt-2 text-sm text-foreground/70 font-mono">{b.reference}</div>
			</Hero>

			<Section>
				<Container>
					<div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
						<div className="space-y-6">
							<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-3">
								<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
									Your booking
								</h2>
								<div className="text-sm">
									{b.customer_first_name} {b.customer_last_name}
									<div className="text-muted-foreground">{b.customer_email}</div>
								</div>
								{b.customer_notes && (
									<p className="text-sm text-foreground/85 whitespace-pre-line pt-3 border-t border-foreground/10">
										{b.customer_notes}
									</p>
								)}
								<div className="pt-3 border-t border-foreground/10 text-sm">
									<Link
										href={`/booking/${reference}`}
										className="text-primary hover:underline"
									>
										See the full booking →
									</Link>
								</div>
							</section>

							<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-3">
								<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
									Today
								</h2>
								<dl className="space-y-1 text-sm">
									<div className="flex items-baseline justify-between gap-3">
										<dt className="text-muted-foreground">Booking total</dt>
										<dd className="font-mono">{formatGbp(b.total_cents)}</dd>
									</div>
									<div className="flex items-baseline justify-between gap-3 pt-2 border-t border-foreground/10">
										<dt className="font-medium">Deposit due now</dt>
										<dd className="font-display text-2xl">
											{formatGbp(b.deposit_required_cents)}
										</dd>
									</div>
									{balanceDue > 0 && (
										<div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground pt-1">
											<dt>Balance later</dt>
											<dd className="font-mono">{formatGbp(balanceDue)}</dd>
										</div>
									)}
								</dl>
							</section>
						</div>

						<aside className="space-y-6 lg:sticky lg:top-28 self-start">
							<BookingDepositPanel
								bookingId={b.id}
								depositCents={b.deposit_required_cents}
								provider={pspKey}
								pendingIntentId={pending?.external_id ?? null}
								publishableKey={publishableKey}
								clientSecret={clientSecret}
							/>
						</aside>
					</div>
				</Container>
			</Section>
		</>
	);
}
