import { sendTemplate } from "./email.service.js";

const VENUE_NAME = "The Assembly Rooms";

function baseUrl() {
	return (process.env.BASE_URL || "").replace(/\/$/, "");
}

function gbp(c) {
	return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
		(c ?? 0) / 100,
	);
}

async function safeSend(templateKey, to, data) {
	if (!to) return;
	try {
		await sendTemplate(templateKey, to, data);
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
