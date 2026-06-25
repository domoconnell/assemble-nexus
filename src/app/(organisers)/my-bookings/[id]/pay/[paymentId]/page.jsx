import { notFound, redirect } from "next/navigation";
import { getBookingForUser, listBookingPayments } from "@/db/queries/bookings";
import { getActivePsp } from "@/lib/psp/index.js";
import { getServerSession } from "@/utils/auth/server-guard";
import BookingInstalmentPanel from "@/site/booking/booking-instalment-panel";
import { BackLink } from "@/site/ui/back-link";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

export async function generateMetadata({ params }) {
	const { id } = await params;
	return {
		title: `Pay - The Assembly Rooms`,
		robots: { index: false, follow: false },
	};
}

/**
 * Authenticated booker-side payment page. Same UI as the public token
 * route but lives under /my-bookings/[id] so the booker's URL stays
 * inside their own surface and never bounces them onto a public-looking
 * /booking/[reference]/... URL.
 */
export default async function MyBookingPayPage({ params }) {
	const { id, paymentId } = await params;
	// Auth + ownership are gated in the shared /my-bookings/[id]/layout.jsx.
	// We only fetch what this page needs to render its body.
	const session = await getServerSession();
	const b = await getBookingForUser(id, session.user.id);
	if (!b) notFound();

	const payments = await listBookingPayments(b.id);
	const payment = payments.find((p) => p.id === paymentId);
	if (!payment) notFound();

	if (payment.paid_at) {
		redirect(`/my-bookings/${b.id}`);
	}
	if (b.status === "cancelled" || b.status === "rejected") {
		redirect(`/my-bookings/${b.id}`);
	}

	let pspKey = null;
	let publishableKey = null;
	let clientSecret = null;
	if (payment.stripe_payment_intent_id) {
		const psp = await getActivePsp(b.venue_id);
		pspKey = psp.key;
		publishableKey = psp.publishableKey ?? null;
		if (psp.key === "stripe" && psp.retrievePaymentIntent) {
			const intent = await psp.retrievePaymentIntent(payment.stripe_payment_intent_id, {
				withSecret: true,
			});
			clientSecret = intent?.client_secret ?? null;
		}
	}

	return (
		<>
			<BackLink href={`/my-bookings/${b.id}`}>
				Back to booking <span className="font-mono">{b.reference}</span>
			</BackLink>

			<div className="space-y-1">
				<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					{payment.label}
				</div>
				<h2 className="font-display text-2xl tracking-tight">
					Complete your payment.
				</h2>
				<p className="text-sm text-muted-foreground">
					Once we receive your payment we&apos;ll send confirmation by email.
				</p>
			</div>

			<div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
				<div>
					<section className="rounded-xl border border-foreground/10 bg-card p-6 divide-y divide-foreground/10 space-y-0">
						<div className="pb-5 space-y-3">
							<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
								Booking
							</h2>
							<div className="text-sm">
								{b.customer_first_name} {b.customer_last_name}
								<div className="text-muted-foreground">{b.customer_email}</div>
							</div>
						</div>

						<div className="py-5 space-y-3">
							<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
								Today
							</h2>
							<dl className="space-y-1 text-sm">
								<div className="flex items-baseline justify-between gap-3">
									<dt className="text-muted-foreground">Booking total</dt>
									<dd className="font-mono">{formatGbp(b.total_cents)}</dd>
								</div>
								<div className="flex items-baseline justify-between gap-3 pt-2 border-t border-foreground/10">
									<dt className="font-medium">{payment.label}</dt>
									<dd className="font-display text-2xl">
										{formatGbp(payment.amount_cents)}
									</dd>
								</div>
							</dl>
						</div>

						{b.agreement_snapshot && (
							<div className="pt-5 space-y-4">
								<BookingAgreementBody agreement={b.agreement_snapshot} />
								{b.agreement_accepted_at && (
									<p className="text-xs text-muted-foreground">
										Accepted on{" "}
										{new Date(b.agreement_accepted_at).toLocaleString("en-GB", {
											timeZone: "Europe/London",
										})}
										.
									</p>
								)}
							</div>
						)}
					</section>
				</div>

				<aside className="lg:sticky lg:top-28 self-start">
					<BookingInstalmentPanel
						payToken={payment.pay_token}
						amountCents={payment.amount_cents}
						provider={pspKey}
						pendingIntentId={payment.stripe_payment_intent_id ?? null}
						publishableKey={publishableKey}
						clientSecret={clientSecret}
						redirectAfterPaid={`/my-bookings/${b.id}`}
						agreementRequired={
							!!b.agreement_snapshot && !b.agreement_accepted_at
						}
						agreementTitle={b.agreement_snapshot?.title ?? "Booking Agreement"}
					/>
				</aside>
			</div>
		</>
	);
}

function BookingAgreementBody({ agreement }) {
	const sections = Array.isArray(agreement?.sections) ? agreement.sections : [];
	return (
		<div className="space-y-4">
			<div>
				<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					{agreement?.version
						? `${agreement.title} · ${agreement.version}`
						: agreement?.title ?? "Booking Agreement"}
				</div>
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
		</div>
	);
}
