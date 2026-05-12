"use client";

import { useRouter } from "next/navigation";
import PaymentForm from "@/site/payments/payment-form";

export default function TicketPaymentPanel({
	orderReference,
	totalCents,
	provider,
	intentId,
}) {
	const router = useRouter();
	return (
		<PaymentForm
			provider={provider}
			intentId={intentId}
			amountCents={totalCents}
			currency="gbp"
			onSuccess={() => {
				router.push(`/my-orders/${orderReference}`);
			}}
		/>
	);
}
