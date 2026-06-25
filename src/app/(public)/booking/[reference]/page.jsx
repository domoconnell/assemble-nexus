import Link from "next/link";
import { notFound } from "next/navigation";
import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { CtaButton } from "@/site/ui/cta-button";
import {
	getBookingByReference,
	listBookingSegments,
	listBookingFacilitySelections,
	listBookingPayments,
} from "@/db/queries/bookings";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

const STATUS_COPY = {
	pending: {
		kicker: "Enquiry received",
		title: "We&apos;ve got your booking.",
		subtitle:
			"You'll hear from us within a working day. If approved, we'll email you the booking agreement and a link to pay your deposit.",
	},
	approved: {
		kicker: "Approved",
		title: "Approved - deposit pending.",
		subtitle:
			"Check your email for the booking agreement and the link to pay your deposit. Once paid, your booking is confirmed.",
	},
	confirmed: {
		kicker: "Confirmed",
		title: "You&apos;re all set.",
		subtitle: "Your deposit is paid and the room is yours. We'll be in touch closer to the date.",
	},
	rejected: {
		kicker: "Not this time",
		title: "Couldn&apos;t take this one.",
		subtitle:
			"We've had to decline this booking. If you'd like to know why or try a different date, drop us a line.",
	},
	cancelled: {
		kicker: "Cancelled",
		title: "Booking cancelled.",
		subtitle: "This booking has been cancelled.",
	},
	completed: {
		kicker: "Done",
		title: "Hope it went well.",
		subtitle: "This booking is complete. Drop us a line if you'd like to do it again.",
	},
};

export async function generateMetadata({ params }) {
	const { reference } = await params;
	return {
		title: `Booking ${reference} - The Assembly Rooms`,
	};
}

export default async function BookingStatusPage({ params }) {
	const { reference } = await params;
	const b = await getBookingByReference(reference);
	if (!b) notFound();

	const [segments, facilitySelections, payments] = await Promise.all([
		listBookingSegments(b.id),
		listBookingFacilitySelections(b.id),
		listBookingPayments(b.id),
	]);

	const paidFromPayments = payments
		.filter((p) => p.paid_at)
		.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
	const paidLegacy = (b.deposit_paid_cents ?? 0) + (b.balance_paid_cents ?? 0);
	const paidCents = payments.length > 0 ? paidFromPayments : paidLegacy;
	const outstandingCents = Math.max(0, (b.total_cents ?? 0) - paidCents);
	const canPayNow = b.status === "approved" || b.status === "confirmed";

	const copy = STATUS_COPY[b.status] ?? STATUS_COPY.pending;

	return (
		<>
			<Hero
				height="short"
				kicker={copy.kicker}
				title={<span dangerouslySetInnerHTML={{ __html: copy.title }} />}
				subtitle={copy.subtitle}
			/>
			<Section>
				<div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
					<div className="space-y-8">
						<div>
							<h2 className="font-display text-2xl tracking-tight mb-4">Your booking</h2>
							<div className="space-y-3">
								{segments.map((s) => (
									<div
										key={s.id}
										className="rounded-xl border border-foreground/10 bg-card p-5"
									>
										<div className="flex items-baseline justify-between gap-4 flex-wrap">
											<div>
												<div className="font-display text-xl tracking-tight">
													{s.room_name}
												</div>
												<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground mt-1">
													{s.booking_type_label}
													{s.layout_label ? ` · ${s.layout_label}` : ""}
												</div>
											</div>
											<div className="text-right">
												<div className="font-mono">
													{formatGbp(
														(s.computed_subtotal_cents ?? 0) +
															(s.computed_vat_cents ?? 0),
													)}
												</div>
											</div>
										</div>
										<div className="mt-3 text-sm text-foreground/85">
											{dateFormatter.format(new Date(s.starts_at))}
											{" · "}
											{timeFormatter.format(new Date(s.starts_at))}
											{" - "}
											{timeFormatter.format(new Date(s.ends_at))}
										</div>
									</div>
								))}
							</div>
						</div>

						{facilitySelections.length > 0 && (
							<div className="rounded-xl border border-foreground/10 bg-card p-5">
								<h3 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
									Add-ons
								</h3>
								<ul className="mt-3 space-y-2 text-sm">
									{facilitySelections.map((s) => (
										<li
											key={s.id}
											className="flex items-baseline justify-between gap-4"
										>
											<span>
												{s.name_snapshot}
												{s.quantity > 1 ? ` × ${s.quantity}` : ""}
											</span>
											<span className="font-mono">
												{formatGbp(
													(s.computed_subtotal_cents ?? 0) +
														(s.computed_vat_cents ?? 0),
												)}
											</span>
										</li>
									))}
								</ul>
							</div>
						)}

						{b.customer_notes && (
							<div className="rounded-xl border border-foreground/10 bg-card p-5">
								<h3 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
									Your notes
								</h3>
								<p className="mt-2 text-sm whitespace-pre-line">{b.customer_notes}</p>
							</div>
						)}
					</div>

					<aside className="lg:sticky lg:top-28 self-start">
						<div className="rounded-xl border border-foreground/10 bg-card p-6 space-y-5">
							<div>
								<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
									Reference
								</div>
								<div className="font-mono text-lg mt-1">{b.reference}</div>
							</div>
							<div className="space-y-2 text-sm border-t border-foreground/10 pt-4">
								{b.discount_amount_cents > 0 && (
									<Row
										label={
											<span className="text-primary">
												{b.discount_label_snapshot ?? "Discount"}
												{b.discount_percent_x100_snapshot != null
													? ` (${(b.discount_percent_x100_snapshot / 100).toFixed(0)}% off)`
													: ""}
											</span>
										}
										value={
											<span className="text-primary">
												−{formatGbp(b.discount_amount_cents)}
											</span>
										}
									/>
								)}
								{b.ticketing_enabled && (b.ticketing_setup_fee_cents ?? 0) > 0 && (
									<Row
										label={`Ticketing setup${
											b.ticketing_setup_fee_pct_x100_snapshot != null
												? ` (${(b.ticketing_setup_fee_pct_x100_snapshot / 100).toFixed(0)}%)`
												: ""
										}`}
										value={formatGbp(b.ticketing_setup_fee_cents)}
									/>
								)}
								<Row label="Subtotal" value={formatGbp(b.subtotal_cents)} />
								{b.vat_cents > 0 && (
									<Row label="VAT" value={formatGbp(b.vat_cents)} />
								)}
								<Row
									label={<span className="font-medium text-foreground">Total</span>}
									value={
										<span className="font-display text-xl">
											{formatGbp(b.total_cents)}
										</span>
									}
								/>
							</div>
							{payments.length > 0 && (
								<div className="space-y-1.5 text-sm border-t border-foreground/10 pt-4">
									{payments.map((p) => {
										const isPaid = !!p.paid_at;
										return (
											<div
												key={p.id}
												className="flex items-baseline justify-between gap-3"
											>
												<span className="text-muted-foreground">
													{p.label}
													{isPaid && (
														<span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-primary">
															paid
														</span>
													)}
												</span>
												<span className="flex items-baseline gap-3">
													<span className="font-mono">{formatGbp(p.amount_cents)}</span>
													{!isPaid && canPayNow && (
														<Link
															href={`/booking/${b.reference}/pay-installment/${p.pay_token}`}
															className="text-xs text-primary hover:underline whitespace-nowrap"
														>
															Pay →
														</Link>
													)}
												</span>
											</div>
										);
									})}
									<div className="flex justify-between font-medium pt-2 border-t border-foreground/10 mt-2">
										<span>Outstanding</span>
										<span className="font-mono">{formatGbp(outstandingCents)}</span>
									</div>
								</div>
							)}
							<div className="border-t border-foreground/10 pt-5 space-y-3">
								<CtaButton href="/contact" variant="outline" className="w-full">
									Get in touch
								</CtaButton>
							</div>
						</div>
					</aside>
				</div>
			</Section>
		</>
	);
}

function Row({ label, value }) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span>{label}</span>
			<span className="font-mono">{value}</span>
		</div>
	);
}
