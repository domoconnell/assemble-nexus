import { sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { sendTemplate } from "./email.service.js";
import { buildOrderTicketsPdfBuffer } from "@/lib/tickets/pdf.js";

const VENUE_NAME = "The Assembly Rooms";

function baseUrl() {
	return (process.env.BASE_URL || "").replace(/\/$/, "");
}

function gbp(c) {
	return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
		(c ?? 0) / 100,
	);
}

function slugifyForFilename(s) {
	return (
		String(s || "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "event"
	);
}

async function safeSend(templateKey, to, data, options) {
	if (!to) return;
	try {
		await sendTemplate(templateKey, to, data, options ?? {});
	} catch (err) {
		console.error(`[email:${templateKey}]`, err?.message || err);
	}
}

export async function sendTicketOrderConfirmationEmail({ order, customer, eventTitle, ticketsCount }) {
	await safeSend("ticket-order-confirmation", customer.email, {
		venue_name: VENUE_NAME,
		first_name: customer.first_name,
		event_title: eventTitle,
		reference: order.reference,
		total: gbp(order.total_cents),
		tickets_count: ticketsCount,
		view_url: `${baseUrl()}/my-orders/${order.reference}`,
	});
}

/**
 * Wallet-pass delivery email - fires on order finalisation. Includes:
 *   - A multi-page PDF of every ticket as an attachment
 *   - A `ticketsURL` to the public no-auth gallery (`/tickets/[order-id]`)
 *     which has the "Add to Apple Wallet" buttons per ticket
 *
 * Tickets are queried fresh so the caller doesn't need to pre-join.
 */
export async function sendTicketsWalletEmail({ order, customer }) {
	if (!customer?.email) return;

	const tickets = await db.execute(sql`
		SELECT
			t.id, t.code, t.holder_name, t.status,
			tol.name_snapshot AS line_name_snapshot,
			tol.name_snapshot AS ticket_type_label,
			${order.reference} AS order_reference,
			e.title AS event_title,
			e.starts_at AS event_starts_at,
			e.ends_at AS event_ends_at,
			e.doors_open_at AS event_doors_open_at,
			v.name AS venue_name
		FROM ticket t
		INNER JOIN ticket_order_line tol ON tol.id = t.ticket_order_line_id
		INNER JOIN event e ON e.id = ${order.event_id}
		INNER JOIN venue v ON v.id = e.venue_id
		WHERE tol.ticket_order_id = ${order.id}
		ORDER BY tol.created_at ASC, t.created_at ASC
	`);
	if (tickets.length === 0) return;

	const eventTitle = tickets[0].event_title;
	const pdfBuffer = await buildOrderTicketsPdfBuffer(tickets);
	const filename = `${slugifyForFilename(eventTitle)}_order_${order.id}.pdf`;
	const ticketsURL = `${baseUrl()}/tickets/${order.id}`;

	await safeSend(
		"apple-wallet-ticket",
		customer.email,
		{
			firstName: customer.first_name || "there",
			eventName: eventTitle,
			ticketsURL,
		},
		{
			attachments: [
				{
					content: pdfBuffer.toString("base64"),
					filename,
					type: "application/pdf",
					disposition: "attachment",
				},
			],
		},
	);
}
