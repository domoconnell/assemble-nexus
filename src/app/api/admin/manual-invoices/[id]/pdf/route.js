import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue, getVenueById } from "@/db/queries/venue.js";
import {
	getManualInvoiceById,
	listManualInvoiceLines,
} from "@/db/queries/manual-invoices.js";
import { buildManualInvoicePdfBuffer } from "@/lib/manual-invoices/invoice-pdf.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const venue = await requireCurrentVenue();
	const { id } = await params;
	if (!id) return new Response("Missing invoice id", { status: 400 });

	const invoice = await getManualInvoiceById(id, { venueId: venue.id });
	if (!invoice) return new Response("Invoice not found", { status: 404 });

	const [lines, venueRow] = await Promise.all([
		listManualInvoiceLines(invoice.id),
		getVenueById(venue.id),
	]);

	const buffer = await buildManualInvoicePdfBuffer({
		invoice,
		lines,
		venue: venueRow ?? venue,
	});

	return new Response(buffer, {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${invoice.reference}.pdf"`,
			"Cache-Control": "private, no-store",
		},
	});
}
