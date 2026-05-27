"use client";

import { useRouter } from "next/navigation";
import PaymentForm from "@/site/payments/payment-form";

export default function OrderPaymentPanel({
	orderReference,
	provider,
	intentId,
	amountCents,
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
			amountCents={amountCents}
			currency="gbp"
			onSuccess={() => {
				router.refresh();
			}}
		/>
	);
}
