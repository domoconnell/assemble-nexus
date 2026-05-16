import { redirect } from "next/navigation";
import { getOrderByReference } from "@/db/queries/orders";

export const dynamic = "force-dynamic";

/**
 * Public entry-point for a ticket order - routes to /pay while pending,
 * otherwise to the delegate portal page (which handles auth/magic-link).
 */
export default async function OrderEntryPage({ params }) {
	const { reference } = await params;
	const order = await getOrderByReference(reference);
	if (!order) redirect(`/my-orders/${reference}`);
	if (order.status === "pending") redirect(`/orders/${reference}/pay`);
	redirect(`/my-orders/${reference}`);
}
