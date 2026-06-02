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
}) {
	const router = useRouter();
	const [starting, setStarting] = useState(false);
	const [error, setError] = useState(null);
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
			const result = await startBookingInstalmentPaymentAction({ pay_token: payToken });
			setIntent(result);
		} catch (err) {
			setError(err?.message || "Could not start payment.");
		} finally {
			setStarting(false);
		}
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
				onSuccess={() => router.refresh()}
			/>
		);
	}

	return (
		<div className="rounded-xl border border-foreground/10 bg-card p-6 space-y-4">
			<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">Card payment</h2>
			<p className="text-sm text-foreground/85">
				Click below to enter your card details and complete this payment.
			</p>
			{error && (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}
			<Button className="w-full" size="lg" onClick={startPayment} disabled={starting}>
				{starting ? "Starting…" : "Continue to payment"}
			</Button>
		</div>
	);
}
