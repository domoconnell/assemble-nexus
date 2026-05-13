import { and, asc, eq, inArray, isNull, desc, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { ticket_order_line } from "@/db/schema/entities/ticket_order_line.js";
import { ticket } from "@/db/schema/entities/ticket.js";
import { ticket_type } from "@/db/schema/entities/ticket_type.js";
import { customer } from "@/db/schema/entities/customer.js";
import { event } from "@/db/schema/entities/event.js";
import { psp_intent } from "@/db/schema/entities/psp_intent.js";
import { file } from "@/db/schema/entities/file.js";
import { contact } from "@/db/schema/entities/contact.js";
import { organisation_contact } from "@/db/schema/entities/organisation_contact.js";

/**
 * Public-access order lookup by ID for the no-auth ticket gallery at
 * `/tickets/[id]`. The URL acts as the capability — the unguessable UUID
 * is what makes the page secure-enough for tickets emailed to buyers.
 */
export async function getOrderForTicketGallery(orderId) {
	const [row] = await db
		.select({
			id: ticket_order.id,
			reference: ticket_order.reference,
			status: ticket_order.status,
			total_cents: ticket_order.total_cents,
			createdAt: ticket_order.createdAt,
			paid_at: ticket_order.paid_at,
			event_id: event.id,
			event_slug: event.slug,
			event_title: event.title,
			event_starts_at: event.starts_at,
			event_ends_at: event.ends_at,
			event_doors_open_at: event.doors_open_at,
			venue_id: event.venue_id,
			venue_name: sql`(select name from "venue" where id = ${event.venue_id})`,
			customer_first_name: customer.first_name,
		})
		.from(ticket_order)
		.innerJoin(event, eq(ticket_order.event_id, event.id))
		.innerJoin(customer, eq(ticket_order.customer_id, customer.id))
		.where(and(eq(ticket_order.id, orderId), isNull(ticket_order.deletedAt)))
		.limit(1);
	return row ?? null;
}

export async function getOrderByReference(reference) {
	const [row] = await db
		.select({
			id: ticket_order.id,
			reference: ticket_order.reference,
			status: ticket_order.status,
			subtotal_cents: ticket_order.subtotal_cents,
			discount_cents: ticket_order.discount_cents,
			vat_cents: ticket_order.vat_cents,
			total_cents: ticket_order.total_cents,
			createdAt: ticket_order.createdAt,
			paid_at: ticket_order.paid_at,
			cancelled_at: ticket_order.cancelled_at,
			event_id: event.id,
			event_slug: event.slug,
			event_title: event.title,
			event_summary: event.summary,
			event_starts_at: event.starts_at,
			event_ends_at: event.ends_at,
			event_doors_open_at: event.doors_open_at,
			event_banner_url: file.public_url,
			customer_id: customer.id,
			customer_first_name: customer.first_name,
			customer_last_name: customer.last_name,
			customer_email: customer.email,
			customer_user_id: customer.user_id,
		})
		.from(ticket_order)
		.innerJoin(event, eq(ticket_order.event_id, event.id))
		.innerJoin(customer, eq(ticket_order.customer_id, customer.id))
		.leftJoin(file, eq(event.banner_file_id, file.id))
		.where(and(eq(ticket_order.reference, reference), isNull(ticket_order.deletedAt)))
		.limit(1);
	return row ?? null;
}

export async function listOrderLines(orderId) {
	return db
		.select()
		.from(ticket_order_line)
		.where(eq(ticket_order_line.ticket_order_id, orderId))
		.orderBy(asc(ticket_order_line.createdAt));
}

/**
 * Tickets for the given user — both via customer.user_id (they bought
 * directly) and via organisation_contact (their org bought).
 */
export async function listTicketsForUser(userId) {
	const selectShape = {
		id: ticket.id,
		code: ticket.code,
		status: ticket.status,
		holder_name: ticket.holder_name,
		ticket_type_label: ticket_order_line.name_snapshot,
		order_id: ticket_order.id,
		order_reference: ticket_order.reference,
		order_status: ticket_order.status,
		event_id: event.id,
		event_title: event.title,
		event_slug: event.slug,
		event_starts_at: event.starts_at,
		event_ends_at: event.ends_at,
	};

	const [viaCustomer, viaOrganisation] = await Promise.all([
		db
			.select(selectShape)
			.from(ticket)
			.innerJoin(ticket_order_line, eq(ticket.ticket_order_line_id, ticket_order_line.id))
			.innerJoin(ticket_order, eq(ticket_order.id, ticket_order_line.ticket_order_id))
			.innerJoin(event, eq(event.id, ticket_order.event_id))
			.innerJoin(customer, eq(customer.id, ticket_order.customer_id))
			.where(
				and(
					eq(customer.user_id, userId),
					isNull(ticket_order.deletedAt),
					sql`${ticket_order.status} in ('paid', 'partially_refunded', 'refunded')`,
				),
			),
		db
			.select(selectShape)
			.from(ticket)
			.innerJoin(ticket_order_line, eq(ticket.ticket_order_line_id, ticket_order_line.id))
			.innerJoin(ticket_order, eq(ticket_order.id, ticket_order_line.ticket_order_id))
			.innerJoin(event, eq(event.id, ticket_order.event_id))
			.innerJoin(organisation_contact, eq(organisation_contact.organisation_id, ticket_order.organisation_id))
			.innerJoin(contact, eq(contact.id, organisation_contact.contact_id))
			.where(
				and(
					eq(contact.user_id, userId),
					isNull(contact.deletedAt),
					isNull(ticket_order.deletedAt),
					sql`${ticket_order.status} in ('paid', 'partially_refunded', 'refunded')`,
				),
			),
	]);

	const byId = new Map();
	for (const r of viaCustomer) byId.set(r.id, r);
	for (const r of viaOrganisation) byId.set(r.id, r);
	return [...byId.values()].sort((a, b) => {
		const aStart = a.event_starts_at ? new Date(a.event_starts_at).getTime() : 0;
		const bStart = b.event_starts_at ? new Date(b.event_starts_at).getTime() : 0;
		return aStart - bStart;
	});
}

/**
 * Single ticket fetch with ownership check.
 */
export async function getTicketForUserByCode(code, userId) {
	const selectShape = {
		id: ticket.id,
		code: ticket.code,
		status: ticket.status,
		holder_name: ticket.holder_name,
		ticket_type_label: ticket_order_line.name_snapshot,
		order_id: ticket_order.id,
		order_reference: ticket_order.reference,
		order_status: ticket_order.status,
		event_id: event.id,
		event_title: event.title,
		event_slug: event.slug,
		event_starts_at: event.starts_at,
		event_ends_at: event.ends_at,
		event_doors_open_at: event.doors_open_at,
		venue_name: sql`(select name from "venue" where id = ${event.venue_id})`,
	};

	const [viaCustomer, viaOrganisation] = await Promise.all([
		db
			.select(selectShape)
			.from(ticket)
			.innerJoin(ticket_order_line, eq(ticket.ticket_order_line_id, ticket_order_line.id))
			.innerJoin(ticket_order, eq(ticket_order.id, ticket_order_line.ticket_order_id))
			.innerJoin(event, eq(event.id, ticket_order.event_id))
			.innerJoin(customer, eq(customer.id, ticket_order.customer_id))
			.where(and(eq(ticket.code, code), eq(customer.user_id, userId)))
			.limit(1),
		db
			.select(selectShape)
			.from(ticket)
			.innerJoin(ticket_order_line, eq(ticket.ticket_order_line_id, ticket_order_line.id))
			.innerJoin(ticket_order, eq(ticket_order.id, ticket_order_line.ticket_order_id))
			.innerJoin(event, eq(event.id, ticket_order.event_id))
			.innerJoin(organisation_contact, eq(organisation_contact.organisation_id, ticket_order.organisation_id))
			.innerJoin(contact, eq(contact.id, organisation_contact.contact_id))
			.where(
				and(
					eq(ticket.code, code),
					eq(contact.user_id, userId),
					isNull(contact.deletedAt),
				),
			)
			.limit(1),
	]);

	return viaCustomer[0] ?? viaOrganisation[0] ?? null;
}

/**
 * Order detail for the given user — ensures they own it before showing.
 */
export async function getOrderForUserByReference(reference, userId) {
	const selectOrder = {
		id: ticket_order.id,
		reference: ticket_order.reference,
		status: ticket_order.status,
		subtotal_cents: ticket_order.subtotal_cents,
		vat_cents: ticket_order.vat_cents,
		total_cents: ticket_order.total_cents,
		paid_at: ticket_order.paid_at,
		createdAt: ticket_order.createdAt,
		event_id: event.id,
		event_title: event.title,
		event_slug: event.slug,
		event_starts_at: event.starts_at,
		event_ends_at: event.ends_at,
	};

	const [viaCustomer, viaOrganisation] = await Promise.all([
		db
			.select(selectOrder)
			.from(ticket_order)
			.innerJoin(event, eq(event.id, ticket_order.event_id))
			.innerJoin(customer, eq(customer.id, ticket_order.customer_id))
			.where(
				and(
					eq(ticket_order.reference, reference),
					eq(customer.user_id, userId),
					isNull(ticket_order.deletedAt),
				),
			)
			.limit(1),
		db
			.select(selectOrder)
			.from(ticket_order)
			.innerJoin(event, eq(event.id, ticket_order.event_id))
			.innerJoin(organisation_contact, eq(organisation_contact.organisation_id, ticket_order.organisation_id))
			.innerJoin(contact, eq(contact.id, organisation_contact.contact_id))
			.where(
				and(
					eq(ticket_order.reference, reference),
					eq(contact.user_id, userId),
					isNull(contact.deletedAt),
					isNull(ticket_order.deletedAt),
				),
			)
			.limit(1),
	]);

	return viaCustomer[0] ?? viaOrganisation[0] ?? null;
}

/**
 * Order + customer + venue context for the invoice PDF.
 * Ownership check via user_id (direct customer or org contact) baked in.
 */
export async function getOrderForInvoice(reference, userId) {
	const { venue } = await import("@/db/schema/entities/venue.js");
	const selectShape = {
		id: ticket_order.id,
		reference: ticket_order.reference,
		status: ticket_order.status,
		subtotal_cents: ticket_order.subtotal_cents,
		vat_cents: ticket_order.vat_cents,
		total_cents: ticket_order.total_cents,
		paid_at: ticket_order.paid_at,
		createdAt: ticket_order.createdAt,
		event_title: event.title,
		event_starts_at: event.starts_at,
		venue_id: event.venue_id,
		customer_first_name: customer.first_name,
		customer_last_name: customer.last_name,
		customer_email: customer.email,
		customer_organisation: customer.organisation,
	};
	const [viaCustomer, viaOrganisation] = await Promise.all([
		db
			.select(selectShape)
			.from(ticket_order)
			.innerJoin(event, eq(event.id, ticket_order.event_id))
			.innerJoin(customer, eq(customer.id, ticket_order.customer_id))
			.where(
				and(
					eq(ticket_order.reference, reference),
					eq(customer.user_id, userId),
					isNull(ticket_order.deletedAt),
				),
			)
			.limit(1),
		db
			.select(selectShape)
			.from(ticket_order)
			.innerJoin(event, eq(event.id, ticket_order.event_id))
			.innerJoin(customer, eq(customer.id, ticket_order.customer_id))
			.innerJoin(organisation_contact, eq(organisation_contact.organisation_id, ticket_order.organisation_id))
			.innerJoin(contact, eq(contact.id, organisation_contact.contact_id))
			.where(
				and(
					eq(ticket_order.reference, reference),
					eq(contact.user_id, userId),
					isNull(contact.deletedAt),
					isNull(ticket_order.deletedAt),
				),
			)
			.limit(1),
	]);
	const order = viaCustomer[0] ?? viaOrganisation[0];
	if (!order) return null;

	const [venueRow] = await db
		.select({ name: venue.name, address_lines: venue.address_lines })
		.from(venue)
		.where(eq(venue.id, order.venue_id))
		.limit(1);

	return { order, venue: venueRow ?? null };
}

export async function getTicketForPdf(code) {
	const [row] = await db
		.select({
			id: ticket.id,
			code: ticket.code,
			status: ticket.status,
			holder_name: ticket.holder_name,
			ticket_type_label: ticket_order_line.name_snapshot,
			order_reference: ticket_order.reference,
			order_status: ticket_order.status,
			event_id: event.id,
			event_title: event.title,
			event_starts_at: event.starts_at,
			event_ends_at: event.ends_at,
			event_doors_open_at: event.doors_open_at,
			event_slug: event.slug,
			venue_name: sql`(select name from "venue" where id = ${event.venue_id})`,
		})
		.from(ticket)
		.innerJoin(ticket_order_line, eq(ticket.ticket_order_line_id, ticket_order_line.id))
		.innerJoin(ticket_order, eq(ticket_order.id, ticket_order_line.ticket_order_id))
		.innerJoin(event, eq(event.id, ticket_order.event_id))
		.where(eq(ticket.code, code))
		.limit(1);
	return row ?? null;
}

export async function listOrderTickets(orderId) {
	const rows = await db
		.select({
			id: ticket.id,
			code: ticket.code,
			status: ticket.status,
			holder_name: ticket.holder_name,
			ticket_order_line_id: ticket.ticket_order_line_id,
			line_name_snapshot: ticket_order_line.name_snapshot,
			line_ticket_type_id: ticket_order_line.ticket_type_id,
		})
		.from(ticket)
		.innerJoin(ticket_order_line, eq(ticket.ticket_order_line_id, ticket_order_line.id))
		.where(eq(ticket_order_line.ticket_order_id, orderId))
		.orderBy(asc(ticket.createdAt));
	return rows;
}

/**
 * Pending intent for an order. Returns null when the order is already paid
 * (so the page won't try to mount a PaymentForm against a settled intent).
 */
export async function getPendingIntentForOrder(orderId) {
	const rows = await db
		.select()
		.from(psp_intent)
		.where(
			and(
				eq(psp_intent.ticket_order_id, orderId),
				eq(psp_intent.status, "requires_payment_method"),
			),
		)
		.orderBy(desc(psp_intent.createdAt))
		.limit(1);
	return rows[0] ?? null;
}

export async function listOrdersForEvent(eventId) {
	const orders = await db
		.select({
			id: ticket_order.id,
			reference: ticket_order.reference,
			status: ticket_order.status,
			subtotal_cents: ticket_order.subtotal_cents,
			vat_cents: ticket_order.vat_cents,
			total_cents: ticket_order.total_cents,
			discount_cents: ticket_order.discount_cents,
			booking_fee_cents: ticket_order.booking_fee_cents,
			booking_fee_borne_by: ticket_order.booking_fee_borne_by,
			organiser_net_cents: ticket_order.organiser_net_cents,
			stripe_fee_estimate_cents: ticket_order.stripe_fee_estimate_cents,
			stripe_fee_actual_cents: ticket_order.stripe_fee_actual_cents,
			createdAt: ticket_order.createdAt,
			paid_at: ticket_order.paid_at,
			cancelled_at: ticket_order.cancelled_at,
			customer_first_name: customer.first_name,
			customer_last_name: customer.last_name,
			customer_email: customer.email,
		})
		.from(ticket_order)
		.innerJoin(customer, eq(ticket_order.customer_id, customer.id))
		.where(and(eq(ticket_order.event_id, eventId), isNull(ticket_order.deletedAt)))
		.orderBy(desc(ticket_order.createdAt));

	if (!orders.length) return orders;

	// Delegate count = sum of (line.quantity × ticket_type.admits_count) for all
	// kind="ticket" lines (including bundle children) on each order.
	const orderIds = orders.map((o) => o.id);
	const ticketLines = await db
		.select({
			order_id: ticket_order_line.ticket_order_id,
			quantity: ticket_order_line.quantity,
			admits_count: ticket_type.admits_count,
		})
		.from(ticket_order_line)
		.leftJoin(ticket_type, eq(ticket_order_line.ticket_type_id, ticket_type.id))
		.where(
			and(
				inArray(ticket_order_line.ticket_order_id, orderIds),
				eq(ticket_order_line.kind, "ticket"),
			),
		);
	const delegatesByOrder = new Map();
	for (const l of ticketLines) {
		const admits = l.admits_count ?? 1;
		delegatesByOrder.set(
			l.order_id,
			(delegatesByOrder.get(l.order_id) ?? 0) + (l.quantity ?? 0) * admits,
		);
	}
	return orders.map((o) => ({
		...o,
		delegate_count: delegatesByOrder.get(o.id) ?? 0,
	}));
}

export async function getSucceededIntentForOrder(orderId) {
	const rows = await db
		.select()
		.from(psp_intent)
		.where(
			and(
				eq(psp_intent.ticket_order_id, orderId),
				eq(psp_intent.status, "succeeded"),
			),
		)
		.orderBy(desc(psp_intent.createdAt))
		.limit(1);
	return rows[0] ?? null;
}

export async function listOrdersForUser(userId) {
	const selectShape = {
		id: ticket_order.id,
		reference: ticket_order.reference,
		status: ticket_order.status,
		total_cents: ticket_order.total_cents,
		createdAt: ticket_order.createdAt,
		event_id: event.id,
		event_title: event.title,
		event_slug: event.slug,
		event_starts_at: event.starts_at,
	};

	const [viaCustomer, viaOrganisation] = await Promise.all([
		db
			.select(selectShape)
			.from(ticket_order)
			.innerJoin(event, eq(ticket_order.event_id, event.id))
			.innerJoin(customer, eq(ticket_order.customer_id, customer.id))
			.where(and(eq(customer.user_id, userId), isNull(ticket_order.deletedAt))),
		db
			.select(selectShape)
			.from(ticket_order)
			.innerJoin(event, eq(ticket_order.event_id, event.id))
			.innerJoin(organisation_contact, eq(organisation_contact.organisation_id, ticket_order.organisation_id))
			.innerJoin(contact, eq(contact.id, organisation_contact.contact_id))
			.where(
				and(
					eq(contact.user_id, userId),
					isNull(contact.deletedAt),
					isNull(ticket_order.deletedAt),
				),
			),
	]);

	const byId = new Map();
	for (const r of viaCustomer) byId.set(r.id, r);
	for (const r of viaOrganisation) byId.set(r.id, r);
	return [...byId.values()].sort((a, b) => {
		const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
		const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
		return bTime - aTime;
	});
}
