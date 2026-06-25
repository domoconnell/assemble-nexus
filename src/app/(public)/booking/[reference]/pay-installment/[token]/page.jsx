import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { Container } from "@/site/ui/container";
import { getBookingPaymentByToken } from "@/db/queries/bookings";
import { getActivePsp } from "@/lib/psp/index.js";
import BookingInstalmentPanel from "@/site/booking/booking-instalment-panel";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

export async function generateMetadata({ params }) {
	const { reference } = await params;
	return { title: `Pay · ${reference} - The Assembly Rooms` };
}

export default async function BookingInstalmentPayPage({ params }) {
	const { reference, token } = await params;
	const payment = await getBookingPaymentByToken(token);
	if (!payment || payment.booking_reference !== reference) notFound();

	if (payment.paid_at) {
		// Already paid — bounce to the booking landing page.
		redirect(`/booking-received/${payment.booking_id}`);
	}
	if (payment.booking_status === "cancelled" || payment.booking_status === "rejected") {
		redirect(`/booking-received/${payment.booking_id}`);
	}

	let pspKey = null;
	let publishableKey = null;
	let clientSecret = null;
	if (payment.stripe_payment_intent_id) {
		const psp = await getActivePsp(payment.venue_id);
		pspKey = psp.key;
		publishableKey = psp.publishableKey ?? null;
		if (psp.key === "stripe" && psp.retrievePaymentIntent) {
			const intent = await psp.retrievePaymentIntent(payment.stripe_payment_intent_id, { withSecret: true });
			clientSecret = intent?.client_secret ?? null;
		}
	}

	return (
		<>
			<Hero
				height="short"
				kicker={payment.label}
				title="Complete your payment."
				subtitle="Once we receive your payment we'll send confirmation by email."
			>
				<div className="mt-2 text-sm text-foreground/70 font-mono">{reference}</div>
			</Hero>

			<Section>
				<Container>
					<div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
						<div className="space-y-6">
							<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-3">
								<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
									Booking
								</h2>
								<div className="text-sm">
									{payment.customer_first_name} {payment.customer_last_name}
									<div className="text-muted-foreground">{payment.customer_email}</div>
								</div>
								<div className="pt-3 border-t border-foreground/10 text-sm">
									<Link
										href={`/booking-received/${payment.booking_id}`}
										className="text-primary hover:underline"
									>
										See the booking →
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
										<dd className="font-mono">{formatGbp(payment.booking_total_cents)}</dd>
									</div>
									<div className="flex items-baseline justify-between gap-3 pt-2 border-t border-foreground/10">
										<dt className="font-medium">{payment.label}</dt>
										<dd className="font-display text-2xl">
											{formatGbp(payment.amount_cents)}
										</dd>
									</div>
								</dl>
							</section>
						</div>

						<aside className="space-y-6 lg:sticky lg:top-28 self-start">
							<BookingInstalmentPanel
								payToken={token}
								amountCents={payment.amount_cents}
								provider={pspKey}
								pendingIntentId={payment.stripe_payment_intent_id ?? null}
								publishableKey={publishableKey}
								clientSecret={clientSecret}
								redirectAfterPaid={`/booking-received/${payment.booking_id}`}
								agreementRequired={
									!!payment.agreement_snapshot && !payment.agreement_accepted_at
								}
								agreementTitle={
									payment.agreement_snapshot?.title ?? "Booking Agreement"
								}
							/>
						</aside>
					</div>

					{payment.agreement_snapshot && (
						<div className="mt-12 max-w-3xl">
							<BookingAgreementBody agreement={payment.agreement_snapshot} />
							{payment.agreement_accepted_at && (
								<p className="mt-4 text-xs text-muted-foreground">
									Accepted on{" "}
									{new Date(payment.agreement_accepted_at).toLocaleString("en-GB", {
										timeZone: "Europe/London",
									})}
									.
								</p>
							)}
						</div>
					)}
				</Container>
			</Section>
		</>
	);
}

function BookingAgreementBody({ agreement }) {
	const sections = Array.isArray(agreement?.sections) ? agreement.sections : [];
	return (
		<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-5">
			<div>
				<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					{agreement?.version ? `${agreement.title} · ${agreement.version}` : agreement?.title}
				</div>
				<h2 className="mt-2 font-display text-2xl tracking-tight">
					{agreement?.title ?? "Booking Agreement"}
				</h2>
			</div>
			{agreement?.intro && (
				<p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-line">
					{agreement.intro}
				</p>
			)}
			{sections.map((s, i) => (
				<div key={i} className="space-y-2">
					{s.heading && (
						<h3 className="font-medium text-foreground text-sm uppercase tracking-[0.16em]">
							{s.heading}
						</h3>
					)}
					{Array.isArray(s.paragraphs) &&
						s.paragraphs
							.filter((p) => p && p.trim().length > 0)
							.map((p, j) => (
								<p
									key={j}
									className="text-sm leading-relaxed text-foreground/85 whitespace-pre-line"
								>
									{p}
								</p>
							))}
				</div>
			))}
		</section>
	);
}
