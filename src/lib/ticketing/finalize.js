import { and, eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { ticket_order_line } from "@/db/schema/entities/ticket_order_line.js";
import { ticket } from "@/db/schema/entities/ticket.js";
import { customer } from "@/db/schema/entities/customer.js";
import { event } from "@/db/schema/entities/event.js";
import { generateTicketCode } from "./codes.js";
import { getActivePsp } from "@/lib/psp/index.js";
import {
	sendTicketOrderConfirmationEmail,
	sendTicketsWalletEmail,
} from "@/utils/email/ticket-emails.js";

/**
 * Finalise a ticket order once payment has succeeded.
 *
 * Idempotent - calling on an already-finalised order is a no-op. Generates
 * `ticket` rows (one per ticket-line quantity, including bundle-substituted
 * child rows). QR codes / wallet passes are out of scope here and ship in
 * the background-worker phase.
 */
export async function finaliseTicketOrder(orderId, { paymentRef } = {}) {
	const [order] = await db
		.select()
		.from(ticket_order)
		.where(eq(ticket_order.id, orderId))
		.limit(1);
	if (!order) throw new Error(`Ticket order ${orderId} not found`);
	if (order.status === "paid") return order; // idempotent

	const now = new Date();
	const [updated] = await db
		.update(ticket_order)
		.set({
			status: "paid",
			paid_at: now,
			stripe_payment_intent_id: paymentRef ?? order.stripe_payment_intent_id,
		})
		.where(eq(ticket_order.id, orderId))
		.returning();

	// Generate tickets from every ticket-kind line (including bundle children).
	const ticketLines = await db
		.select()
		.from(ticket_order_line)
		.where(and(eq(ticket_order_line.ticket_order_id, orderId), eq(ticket_order_line.kind, "ticket")));

	const newTickets = [];
	for (const line of ticketLines) {
		for (let i = 0; i < line.quantity; i++) {
			newTickets.push({
				ticket_order_line_id: line.id,
				code: generateTicketCode(),
				status: "valid",
			});
		}
	}
	if (newTickets.length) {
		await db.insert(ticket).values(newTickets);
	}

	const [cust] = await db
		.select()
		.from(customer)
		.where(eq(customer.id, updated.customer_id))
		.limit(1);
	const [ev] = await db
		.select({ title: event.title, venue_id: event.venue_id })
		.from(event)
		.where(eq(event.id, updated.event_id))
		.limit(1);

	// Best-effort: ask the active PSP what the processing fee actually was
	// and back-fill `stripe_fee_actual_cents`. Drivers that can't report a
	// real number (FakePSP, or Stripe without a secret key) return null and
	// we leave the column as-is.
	if (updated.stripe_payment_intent_id && ev?.venue_id) {
		try {
			const psp = await getActivePsp(ev.venue_id);
			const fee = await psp.getActualFeeForIntent(updated.stripe_payment_intent_id);
			if (typeof fee === "number") {
				await db
					.update(ticket_order)
					.set({ stripe_fee_actual_cents: fee })
					.where(eq(ticket_order.id, updated.id));
			}
		} catch (err) {
			console.error("[finaliseTicketOrder] fee back-fill failed", err);
		}
	}

	// Fire-and-forget confirmation email.
	try {
		if (cust && ev) {
			// Wallet email is the primary delivery (PDF attached + link to the
			// `/tickets/[id]` gallery for Add-to-Wallet). The bare confirmation
			// template is kept around for venues that prefer a no-attachment
			// notice; safeSend silently no-ops when its template ID isn't set.
			await Promise.all([
				sendTicketsWalletEmail({ order: updated, customer: cust }),
				sendTicketOrderConfirmationEmail({
					order: updated,
					customer: cust,
					eventTitle: ev.title,
					ticketsCount: newTickets.length,
				}),
			]);
		}
	} catch (err) {
		console.error("[finaliseTicketOrder] email send failed", err);
	}

	return updated;
}
