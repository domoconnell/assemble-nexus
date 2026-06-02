import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue, getVenueById } from "@/db/queries/venue.js";
import {
	getInvoiceById,
	getTenancyById,
	listInvoiceLines,
} from "@/db/queries/tenancies.js";
import { buildTenancyInvoicePdfBuffer } from "@/lib/tenancies/invoice-pdf.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const venue = await requireCurrentVenue();
	const { id } = await params;
	if (!id) return new Response("Missing invoice id", { status: 400 });

	const invoice = await getInvoiceById(id, { venueId: venue.id });
	if (!invoice) return new Response("Invoice not found", { status: 404 });

	const [lines, tenancy, venueRow] = await Promise.all([
		listInvoiceLines(invoice.id),
		getTenancyById(invoice.tenancy_id, { venueId: venue.id }),
		getVenueById(venue.id),
	]);

	const buffer = await buildTenancyInvoicePdfBuffer({
		invoice,
		lines,
		tenancy,
		venue: venueRow ?? venue,
	});

	return new Response(buffer, {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="tenancy-invoice-${invoice.reference}.pdf"`,
			"Cache-Control": "private, no-store",
		},
	});
}
