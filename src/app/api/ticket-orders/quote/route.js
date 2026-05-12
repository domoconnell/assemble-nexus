import { z } from "zod";
import { json } from "@/utils/auth/auth-guard.js";
import { quoteTicketOrder } from "@/lib/ticketing/pricing.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AddonSchema = z.object({
	addon_id: z.string().uuid(),
	quantity: z.coerce.number().int().min(1).max(50).default(1),
});

const TicketEntrySchema = z.object({
	ticket_type_id: z.string().uuid(),
	quantity: z.coerce.number().int().min(1).max(500),
	addons: z.array(AddonSchema).optional().default([]),
});

const BodySchema = z.object({
	event_id: z.string().uuid(),
	cart: z.object({
		tickets: z.array(TicketEntrySchema).max(40),
	}),
	codes: z.array(z.string().max(80)).optional().default([]),
	customer_covers_fee: z.coerce.boolean().optional().default(false),
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

	const quote = await quoteTicketOrder({
		eventId: parsed.data.event_id,
		cart: parsed.data.cart,
		codes: parsed.data.codes,
		customerCoversFeeOptIn: parsed.data.customer_covers_fee,
	});
	if (quote?.error) return json(400, { error: quote.error });

	return json(200, quote);
}
