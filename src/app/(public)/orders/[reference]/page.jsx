import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy route — redirect to the delegate portal. The new home for order
 * detail is /my-orders/[reference] which handles unauth visitors with a
 * magic-link form.
 */
export default async function LegacyOrderPage({ params }) {
	const { reference } = await params;
	redirect(`/my-orders/${reference}`);
}
