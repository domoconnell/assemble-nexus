"use client";

import { useRouter } from "next/navigation";
import PaymentForm from "@/site/payments/payment-form";

export default function TicketPaymentPanel({
	orderReference,
	totalCents,
	provider,
	intentId,
	clientSecret,
	publishableKey,
}) {
	const router = useRouter();
	return (
		<PaymentForm
			provider={provider}
			intentId={intentId}
			clientSecret={clientSecret}
			publishableKey={publishableKey}
			amountCents={totalCents}
			currency="gbp"
			onSuccess={() => {
				router.push(`/my-orders/${orderReference}`);
			}}
		/>
	);
}
