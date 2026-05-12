import { getServerSession } from "@/utils/auth/server-guard.js";
import { getOrderForInvoice, listOrderLines } from "@/db/queries/orders.js";
import { buildInvoicePdfBuffer } from "@/lib/tickets/invoice-pdf.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
	const { reference } = await params;
	if (!reference) return new Response("Missing reference", { status: 400 });

	const session = await getServerSession();
	if (!session?.user) return new Response("Unauthorised", { status: 401 });

	const data = await getOrderForInvoice(reference, session.user.id);
	if (!data) return new Response("Order not found", { status: 404 });

	const { order, venue } = data;
	if (order.status === "pending") {
		return new Response("Order not paid", { status: 402 });
	}

	const lines = await listOrderLines(order.id);
	const buffer = await buildInvoicePdfBuffer({
		order,
		lines,
		customer: {
			first_name: order.customer_first_name,
			last_name: order.customer_last_name,
			email: order.customer_email,
			organisation: order.customer_organisation,
		},
		venue,
	});

	return new Response(buffer, {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="invoice-${order.reference}.pdf"`,
			"Cache-Control": "private, no-store",
		},
	});
}
