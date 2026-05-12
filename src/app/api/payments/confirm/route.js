import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { json } from "@/utils/auth/auth-guard.js";
import { db } from "@/db/index.js";
import { psp_intent } from "@/db/schema/entities/psp_intent.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { getActivePsp } from "@/lib/psp/index.js";
import { finaliseTicketOrder } from "@/lib/ticketing/finalize.js";
import { finaliseBookingDeposit, finaliseBookingBalance } from "@/lib/booking/finalize.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CardSchema = z.object({
	number: z.string().min(12).max(24),
	exp_month: z.coerce.number().int().min(1).max(12),
	exp_year: z.coerce.number().int().min(2025).max(2099),
	cvc: z.string().min(3).max(4),
	name: z.string().max(120).optional().nullable(),
	postcode: z.string().max(16).optional().nullable(),
});

const BodySchema = z.object({
	intent_id: z.string().min(1),
	payment_method_details: z.object({
		card: CardSchema,
	}),
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
	const psp = await getActivePsp(venue.id);

	try {
		const intent = await psp.confirmPayment({
			intent_id: parsed.data.intent_id,
			payment_method_details: parsed.data.payment_method_details,
		});

		// On success, finalise whichever application entity this intent was for.
		let orderReference = null;
		let bookingReference = null;
		if (intent.status === "succeeded") {
			const [row] = await db
				.select()
				.from(psp_intent)
				.where(
					and(
						eq(psp_intent.provider, psp.key),
						eq(psp_intent.external_id, intent.id),
					),
				)
				.limit(1);
			if (row?.ticket_order_id) {
				const finalised = await finaliseTicketOrder(row.ticket_order_id, {
					paymentRef: intent.id,
				});
				orderReference = finalised?.reference ?? null;
			} else if (row?.booking_id) {
				const kind = row.metadata?.kind ?? "deposit";
				const finalised = kind === "balance"
					? await finaliseBookingBalance(row.booking_id, {
						paymentRef: intent.id,
						amountPaidCents: row.amount_cents,
					})
					: await finaliseBookingDeposit(row.booking_id, {
						paymentRef: intent.id,
						amountPaidCents: row.amount_cents,
					});
				bookingReference = finalised?.reference ?? null;
			}
		}

		return json(200, { intent, order_reference: orderReference, booking_reference: bookingReference });
	} catch (err) {
		const isDecline = err?.code === "card_declined";
		return json(isDecline ? 402 : 400, {
			error: err?.message || "Payment failed",
			code: err?.code ?? null,
			intent: err?.intent ?? null,
		});
	}
}
