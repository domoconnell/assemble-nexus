import { getTicketForPdf } from "@/db/queries/orders.js";
import { buildTicketPdfBuffer } from "@/lib/tickets/pdf.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
	const { code } = await params;
	if (!code) return new Response("Missing code", { status: 400 });

	const ticket = await getTicketForPdf(code);
	if (!ticket) return new Response("Ticket not found", { status: 404 });
	if (ticket.order_status === "pending") {
		return new Response("Order not paid", { status: 402 });
	}

	const buffer = await buildTicketPdfBuffer(ticket);
	return new Response(buffer, {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="ticket-${ticket.order_reference}-${ticket.code}.pdf"`,
			"Cache-Control": "private, no-store",
		},
	});
}
