"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import PaymentForm from "@/site/payments/payment-form";
import { startBookingBalancePaymentAction } from "@/app/(public)/booking/[reference]/pay-balance/actions";

export default function BookingBalancePanel({
	bookingId,
	balanceCents,
	provider,
	pendingIntentId,
}) {
	const router = useRouter();
	const [starting, setStarting] = useState(false);
	const [error, setError] = useState(null);
	const [intent, setIntent] = useState(
		provider && pendingIntentId
			? { provider, intent_id: pendingIntentId }
			: null,
	);

	async function startPayment() {
		setStarting(true);
		setError(null);
		try {
			const result = await startBookingBalancePaymentAction({ booking_id: bookingId });
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
				amountCents={balanceCents}
				currency="gbp"
				onSuccess={() => router.refresh()}
			/>
		);
	}

	return (
		<div className="rounded-xl border border-foreground/10 bg-card p-6 space-y-4">
			<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">Balance</h2>
			<p className="text-sm text-foreground/85">
				Click below to enter your card details and pay the outstanding balance.
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
