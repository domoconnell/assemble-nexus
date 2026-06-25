"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import PaymentForm from "@/site/payments/payment-form";
import { startBookingInstalmentPaymentAction } from "@/app/(public)/booking/[reference]/pay-installment/[token]/actions";

export default function BookingInstalmentPanel({
	payToken,
	amountCents,
	provider,
	pendingIntentId,
	publishableKey,
	clientSecret,
	redirectAfterPaid,
	agreementRequired = false,
	agreementTitle = "Booking Agreement",
}) {
	const router = useRouter();
	const [starting, setStarting] = useState(false);
	const [error, setError] = useState(null);
	const [accepted, setAccepted] = useState(!agreementRequired);
	const [paid, setPaid] = useState(false);
	const [intent, setIntent] = useState(
		provider && pendingIntentId
			? {
					provider,
					intent_id: pendingIntentId,
					publishable_key: publishableKey ?? null,
					client_secret: clientSecret ?? null,
				}
			: null,
	);

	async function startPayment() {
		setStarting(true);
		setError(null);
		try {
			const result = await startBookingInstalmentPaymentAction({
				pay_token: payToken,
				accept_agreement: agreementRequired ? true : undefined,
			});
			setIntent(result);
		} catch (err) {
			setError(err?.message || "Could not start payment.");
		} finally {
			setStarting(false);
		}
	}

	if (paid) {
		return (
			<div className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-3 text-center">
				<div className="text-3xl">✓</div>
				<h2 className="font-display text-xl tracking-tight">Payment received</h2>
				<p className="text-sm text-foreground/85">
					Thanks. Taking you back to your booking now…
				</p>
			</div>
		);
	}

	if (intent) {
		return (
			<PaymentForm
				provider={intent.provider}
				intentId={intent.intent_id}
				clientSecret={intent.client_secret}
				publishableKey={intent.publishable_key}
				amountCents={amountCents}
				currency="gbp"
				onSuccess={() => {
					// The Stripe webhook stamps `paid_at` async — it usually
					// lands within ~1–2s but isn't guaranteed. Bounce the
					// user to whichever booking page they came from; that
					// page reads the installments fresh, and we forced
					// router.refresh() first so the cache is invalidated.
					setPaid(true);
					router.refresh();
					if (redirectAfterPaid) {
						setTimeout(() => router.push(redirectAfterPaid), 1500);
					}
				}}
			/>
		);
	}

	return (
		<div className="rounded-xl border border-foreground/10 bg-card p-6 space-y-4">
			<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">Card payment</h2>
			<p className="text-sm text-foreground/85">
				Click below to enter your card details and complete this payment.
			</p>
			{agreementRequired && (
				<label className="flex items-start gap-3 rounded-md border border-foreground/15 bg-background/60 px-3 py-2 text-sm cursor-pointer hover:border-primary/40 transition">
					<input
						type="checkbox"
						checked={accepted}
						onChange={(e) => setAccepted(e.target.checked)}
						className="mt-1 size-4 accent-primary"
					/>
					<span className="text-foreground/85">
						I have read and agree to the <strong>{agreementTitle}</strong> shown below.
					</span>
				</label>
			)}
			{error && (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}
			<Button
				className="w-full"
				size="lg"
				onClick={startPayment}
				disabled={starting || (agreementRequired && !accepted)}
			>
				{starting ? "Starting…" : "Continue to payment"}
			</Button>
			{agreementRequired && !accepted && (
				<p className="text-xs text-muted-foreground">
					Tick the box above to enable the payment button.
				</p>
			)}
		</div>
	);
}
