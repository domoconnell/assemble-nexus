import { eq } from "drizzle-orm";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue, getVenueById } from "@/db/queries/venue.js";
import {
	getBookingById,
	listBookingSegments,
	listBookingPayments,
	listBookingFacilitySelections,
} from "@/db/queries/bookings.js";
import { getOrganisationWithContact } from "@/db/queries/crm.js";
import { db } from "@/db/index.js";
import { booking_payment } from "@/db/schema/entities/booking_payment.js";
import { buildBookingInvoicePdfBuffer } from "@/lib/bookings/invoice-pdf.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Booking invoice PDF endpoint. Without `?payment_id=` it builds a
 * full-booking invoice for the whole `total_cents`. With `?payment_id=`
 * it scopes to a single `booking_payment` row (deposit, installment,
 * etc.) and returns an invoice just for that slice.
 *
 * Returns 404 when the booking or payment isn't found / doesn't belong
 * to the current admin's venue.
 */
export async function GET(request, { params }) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const venue = await requireCurrentVenue();
	const { id } = await params;
	if (!id) return new Response("Missing booking id", { status: 400 });

	const booking = await getBookingById(id);
	if (!booking || booking.venue_id !== venue.id) {
		return new Response("Booking not found", { status: 404 });
	}

	const url = new URL(request.url);
	const paymentId = url.searchParams.get("payment_id") || null;

	let payment = null;
	if (paymentId) {
		const [row] = await db
			.select()
			.from(booking_payment)
			.where(eq(booking_payment.id, paymentId))
			.limit(1);
		if (!row || row.booking_id !== booking.id) {
			return new Response("Payment not found", { status: 404 });
		}
		payment = row;
	}

	const [segments, payments, facilities, venueRow, organisation] = await Promise.all([
		listBookingSegments(booking.id),
		listBookingPayments(booking.id),
		listBookingFacilitySelections(booking.id),
		getVenueById(venue.id),
		booking.organisation_id ? getOrganisationWithContact(booking.organisation_id) : null,
	]);

	// When the booking is linked to a CRM org we prefer that org's
	// primary contact for the "Billed to" name + email — admins keep
	// the CRM record current; the legacy `customer` row is a frozen
	// booking-time snapshot.
	const customer = organisation?.contact_first_name
		? {
				first_name: organisation.contact_first_name,
				last_name: organisation.contact_last_name,
				email: organisation.contact_email,
			}
		: {
				first_name: booking.customer_first_name,
				last_name: booking.customer_last_name,
				email: booking.customer_email,
			};

	const buffer = await buildBookingInvoicePdfBuffer({
		booking,
		payment,
		payments,
		segments: segments.map((s) => ({
			id: s.id,
			room_name: s.room_name,
			starts_at: s.starts_at,
			ends_at: s.ends_at,
			booking_type_label: s.booking_type_label,
			rate_snapshot_kind: s.rate_snapshot_kind,
			rate_snapshot_amount_cents: s.rate_snapshot_amount_cents,
			units_x100: s.units_x100,
			subtotal_cents: s.computed_subtotal_cents,
		})),
		facilities,
		customer,
		organisation,
		venue: venueRow ?? venue,
	});

	const filename = payment
		? `invoice-${booking.reference}-${payment.label.replace(/\s+/g, "-").toLowerCase()}.pdf`
		: `invoice-${booking.reference}.pdf`;

	return new Response(buffer, {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "private, no-store",
		},
	});
}
