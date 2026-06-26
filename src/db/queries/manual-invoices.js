import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { manual_invoice, manual_invoice_line } from "@/db/schema/entities/manual_invoice.js";
import { organisation } from "@/db/schema/entities/organisation.js";

export async function getManualInvoiceById(id, { venueId } = {}) {
	const [row] = await db
		.select({
			id: manual_invoice.id,
			venue_id: manual_invoice.venue_id,
			reference: manual_invoice.reference,
			organisation_id: manual_invoice.organisation_id,
			organisation_name: organisation.name,
			organisation_address_lines: organisation.address_lines,
			organisation_vat_number: organisation.vat_number,
			customer_name: manual_invoice.customer_name,
			customer_email: manual_invoice.customer_email,
			customer_address_lines: manual_invoice.customer_address_lines,
			customer_vat_number: manual_invoice.customer_vat_number,
			subtotal_cents: manual_invoice.subtotal_cents,
			discount_cents: manual_invoice.discount_cents,
			vat_cents: manual_invoice.vat_cents,
			total_cents: manual_invoice.total_cents,
			description: manual_invoice.description,
			notes: manual_invoice.notes,
			issued_at: manual_invoice.issued_at,
			paid_at: manual_invoice.paid_at,
			createdAt: manual_invoice.createdAt,
		})
		.from(manual_invoice)
		.leftJoin(organisation, eq(organisation.id, manual_invoice.organisation_id))
		.where(
			and(
				eq(manual_invoice.id, id),
				isNull(manual_invoice.deletedAt),
				...(venueId ? [eq(manual_invoice.venue_id, venueId)] : []),
			),
		)
		.limit(1);
	return row ?? null;
}

export async function listManualInvoiceLines(invoiceId) {
	return db
		.select()
		.from(manual_invoice_line)
		.where(eq(manual_invoice_line.invoice_id, invoiceId))
		.orderBy(asc(manual_invoice_line.sort_order), asc(manual_invoice_line.createdAt));
}

/**
 * Pick the next reference for a venue's manual invoices. Counts existing
 * (including soft-deleted, so the reference can't be reused) and uses
 * the count + 1, padded to 4 digits. Format: `MI-YYYY-NNNN`.
 */
export async function nextManualInvoiceReference(venueId, year = new Date().getFullYear()) {
	const rows = await db
		.select({ id: manual_invoice.id })
		.from(manual_invoice)
		.where(eq(manual_invoice.venue_id, venueId));
	const n = rows.length + 1;
	return `MI-${year}-${String(n).padStart(4, "0")}`;
}

export async function listRecentManualInvoices(venueId, { limit = 50 } = {}) {
	return db
		.select({
			id: manual_invoice.id,
			reference: manual_invoice.reference,
			organisation_id: manual_invoice.organisation_id,
			organisation_name: organisation.name,
			customer_name: manual_invoice.customer_name,
			total_cents: manual_invoice.total_cents,
			issued_at: manual_invoice.issued_at,
			paid_at: manual_invoice.paid_at,
		})
		.from(manual_invoice)
		.leftJoin(organisation, eq(organisation.id, manual_invoice.organisation_id))
		.where(and(eq(manual_invoice.venue_id, venueId), isNull(manual_invoice.deletedAt)))
		.orderBy(desc(manual_invoice.issued_at))
		.limit(limit);
}
