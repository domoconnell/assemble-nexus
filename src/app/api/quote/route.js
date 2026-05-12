import { z } from "zod";
import { json } from "@/utils/auth/auth-guard.js";
import { priceQuote, computeDeposit } from "@/lib/booking/pricing.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { getActiveDepositPolicy } from "@/db/queries/bookings.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SegmentSchema = z.object({
	room_id: z.string().uuid(),
	booking_type_id: z.string().uuid(),
	layout_id: z.string().uuid().optional().nullable(),
	starts_at: z.string(),
	ends_at: z.string(),
});

const FacilitySelectionSchema = z.object({
	facility_package_id: z.string().uuid(),
	quantity: z.coerce.number().int().min(1).max(50).default(1),
});

const TicketingSchema = z.object({
	enabled: z.coerce.boolean().optional().default(false),
	room_id: z.string().uuid().optional().nullable(),
});

const BodySchema = z.object({
	segments: z.array(SegmentSchema).min(1).max(40),
	facility_selections: z.array(FacilitySelectionSchema).max(40).optional().default([]),
	discount_id: z.string().uuid().optional().nullable(),
	ticketing: TicketingSchema.optional().nullable(),
});

export async function POST(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "Invalid JSON" });
	}

	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) {
		return json(400, { error: "Invalid request", issues: parsed.error.issues });
	}

	const venue = await requireCurrentVenue();
	const quote = await priceQuote({
		venueId: venue.id,
		segments: parsed.data.segments,
		facilitySelections: parsed.data.facility_selections,
		discountId: parsed.data.discount_id ?? null,
		ticketing: parsed.data.ticketing ?? null,
	});
	const depositPolicy = await getActiveDepositPolicy(venue.id);
	const deposit = computeDeposit({
		totalCents: quote.total_cents,
		depositPolicy,
	});

	return json(200, {
		...quote,
		deposit_required_cents: deposit.required_cents,
		deposit_non_refundable_cents: deposit.non_refundable_cents,
		deposit_pct_x100: depositPolicy?.deposit_pct_x100 ?? null,
		non_refundable_pct_x100: depositPolicy?.non_refundable_pct_x100 ?? null,
	});
}
