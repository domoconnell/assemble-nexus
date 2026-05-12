import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { event } from "@/db/schema/entities/event.js";
import { event_room } from "@/db/schema/entities/event_room.js";
import { event_faq } from "@/db/schema/entities/event_faq.js";
import { customer } from "@/db/schema/entities/customer.js";
import { booking } from "@/db/schema/entities/booking.js";
import { booking_segment } from "@/db/schema/entities/booking_segment.js";
import { room } from "@/db/schema/entities/room.js";
import { file } from "@/db/schema/entities/file.js";
import { ticket_type } from "@/db/schema/entities/ticket_type.js";
import { ticket_addon } from "@/db/schema/entities/ticket_addon.js";
import { ticket_addon_group } from "@/db/schema/entities/ticket_addon_group.js";
import { ticket_type_addon } from "@/db/schema/entities/ticket_type_addon.js";
import { ticket_bundle } from "@/db/schema/entities/ticket_bundle.js";
import { ticket_bundle_item } from "@/db/schema/entities/ticket_bundle_item.js";
import { ticket_discount } from "@/db/schema/entities/ticket_discount.js";
import { ticket_discount_type } from "@/db/schema/entities/ticket_discount_type.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { ticket_order_line } from "@/db/schema/entities/ticket_order_line.js";
import { user_event_organiser } from "@/db/schema/entities/user_event_organiser.js";
import { contact } from "@/db/schema/entities/contact.js";
import { organisation_contact } from "@/db/schema/entities/organisation_contact.js";

function notDeleted(table) {
	return isNull(table.deletedAt);
}

export async function listEventsForAdmin(venueId, { tab = "active" } = {}) {
	const conditions = [eq(event.venue_id, venueId), notDeleted(event)];
	if (tab === "active") {
		conditions.push(inArray(event.status, ["draft", "pending_review", "published"]));
	} else if (tab === "pending_review") {
		conditions.push(eq(event.status, "pending_review"));
	} else if (tab === "past") {
		conditions.push(inArray(event.status, ["past", "cancelled"]));
	}
	return db
		.select({
			id: event.id,
			slug: event.slug,
			title: event.title,
			summary: event.summary,
			status: event.status,
			visibility: event.visibility,
			is_ticketed: event.is_ticketed,
			starts_at: event.starts_at,
			ends_at: event.ends_at,
			updatedAt: event.updatedAt,
			banner_url: file.public_url,
		})
		.from(event)
		.leftJoin(file, eq(event.banner_file_id, file.id))
		.where(and(...conditions))
		.orderBy(asc(event.starts_at), desc(event.updatedAt));
}

export async function getEventById(id) {
	const [e] = await db
		.select()
		.from(event)
		.where(and(eq(event.id, id), notDeleted(event)))
		.limit(1);
	return e ?? null;
}

export async function getEventByCheckinCode(code) {
	if (!code) return null;
	const [e] = await db
		.select({
			id: event.id,
			title: event.title,
			starts_at: event.starts_at,
			ends_at: event.ends_at,
			doors_open_at: event.doors_open_at,
			status: event.status,
			venue_id: event.venue_id,
			checkin_code: event.checkin_code,
		})
		.from(event)
		.where(and(eq(event.checkin_code, code), notDeleted(event)))
		.limit(1);
	return e ?? null;
}

export async function countEventTickets(eventId) {
	const rows = await db.execute(sql`
		select
			count(*)::int as total,
			count(*) filter (where t.status = 'used')::int as used
		from ticket t
		inner join ticket_order_line tol on tol.id = t.ticket_order_line_id
		inner join ticket_order o on o.id = tol.ticket_order_id
		where o.event_id = ${eventId}
		  and o.status in ('paid', 'partially_refunded')
		  and t.status in ('valid', 'used')
	`);
	const r = rows.rows?.[0] ?? rows[0] ?? { total: 0, used: 0 };
	return { total: Number(r.total ?? 0), used: Number(r.used ?? 0) };
}

export async function getEventBySlug(venueId, slug) {
	const [e] = await db
		.select({
			id: event.id,
			venue_id: event.venue_id,
			slug: event.slug,
			title: event.title,
			summary: event.summary,
			banner_file_id: event.banner_file_id,
			banner_url: file.public_url,
			body_blocks: event.body_blocks,
			extra_info_blocks: event.extra_info_blocks,
			starts_at: event.starts_at,
			ends_at: event.ends_at,
			doors_open_at: event.doors_open_at,
			booking_id: event.booking_id,
			organiser_customer_id: event.organiser_customer_id,
			visibility: event.visibility,
			status: event.status,
			is_ticketed: event.is_ticketed,
			max_occupancy: event.max_occupancy,
			external_url: event.external_url,
		})
		.from(event)
		.leftJoin(file, eq(event.banner_file_id, file.id))
		.where(and(eq(event.venue_id, venueId), eq(event.slug, slug), notDeleted(event)))
		.limit(1);
	return e ?? null;
}

/**
 * Events the given user can manage. Two paths:
 *   1. via user_event_organiser → event_organiser_id (legacy organiser model)
 *   2. via contact (user_id) → organisation_contact → organisation_id
 *      → event.organiser_organisation_id (new CRM-driven model)
 *
 * Results from both paths are merged and de-duplicated by event id.
 */
export async function listEventsForHirer(userId) {
	const selectShape = {
		id: event.id,
		slug: event.slug,
		title: event.title,
		summary: event.summary,
		status: event.status,
		visibility: event.visibility,
		starts_at: event.starts_at,
		ends_at: event.ends_at,
		is_ticketed: event.is_ticketed,
		banner_url: file.public_url,
		organiser_id: event.event_organiser_id,
	};

	const [viaOrganiser, viaOrganisation] = await Promise.all([
		db
			.select(selectShape)
			.from(event)
			.innerJoin(
				user_event_organiser,
				eq(user_event_organiser.event_organiser_id, event.event_organiser_id),
			)
			.leftJoin(file, eq(event.banner_file_id, file.id))
			.where(
				and(
					eq(user_event_organiser.user_id, userId),
					notDeleted(event),
					inArray(event.status, ["draft", "pending_review", "published"]),
				),
			),
		db
			.select(selectShape)
			.from(event)
			.innerJoin(
				organisation_contact,
				eq(organisation_contact.organisation_id, event.organiser_organisation_id),
			)
			.innerJoin(contact, eq(contact.id, organisation_contact.contact_id))
			.leftJoin(file, eq(event.banner_file_id, file.id))
			.where(
				and(
					eq(contact.user_id, userId),
					isNull(contact.deletedAt),
					notDeleted(event),
					inArray(event.status, ["draft", "pending_review", "published"]),
				),
			),
	]);

	const byId = new Map();
	for (const row of viaOrganiser) byId.set(row.id, row);
	for (const row of viaOrganisation) byId.set(row.id, row);
	return [...byId.values()].sort((a, b) => {
		const aStart = a.starts_at ? new Date(a.starts_at).getTime() : Infinity;
		const bStart = b.starts_at ? new Date(b.starts_at).getTime() : Infinity;
		return aStart - bStart;
	});
}

/**
 * Check whether a user can edit a given event (admin/staff bypass; otherwise must
 * belong to the event's organiser).
 */
export async function userCanEditEvent(userId, eventId) {
	const [ev] = await db.select().from(event).where(eq(event.id, eventId)).limit(1);
	if (!ev) return false;
	if (!ev.event_organiser_id) return false;
	const [link] = await db
		.select()
		.from(user_event_organiser)
		.where(
			and(
				eq(user_event_organiser.user_id, userId),
				eq(user_event_organiser.event_organiser_id, ev.event_organiser_id),
			),
		)
		.limit(1);
	return !!link;
}

/**
 * Published events at a specific room. `which="upcoming"` returns events
 * starting from now, `which="past"` returns events whose start date is in
 * the past. Used by the public room page widgets.
 */
export async function listPublishedEventsForRoom(venueId, roomId, { which = "upcoming", limit = 12 } = {}) {
	const now = new Date();
	const condition = which === "upcoming"
		? sql`${event.starts_at} >= ${now.toISOString()}`
		: sql`${event.starts_at} < ${now.toISOString()}`;

	return db
		.selectDistinct({
			id: event.id,
			slug: event.slug,
			title: event.title,
			summary: event.summary,
			starts_at: event.starts_at,
			is_ticketed: event.is_ticketed,
			external_url: event.external_url,
			banner_url: file.public_url,
			gallery_photo_url: sql`(select public_url from "file" where id = ${event.gallery_photo_file_id})`,
		})
		.from(event)
		.innerJoin(event_room, eq(event_room.event_id, event.id))
		.leftJoin(file, eq(file.id, event.banner_file_id))
		.where(
			and(
				eq(event.venue_id, venueId),
				eq(event_room.room_id, roomId),
				eq(event.visibility, "public"),
				eq(event.status, "published"),
				notDeleted(event),
				condition,
			),
		)
		.orderBy(which === "upcoming" ? asc(event.starts_at) : desc(event.starts_at))
		.limit(limit);
}

export async function listPublishedEvents(venueId) {
	const now = new Date();
	return db
		.select({
			id: event.id,
			slug: event.slug,
			title: event.title,
			summary: event.summary,
			banner_url: file.public_url,
			starts_at: event.starts_at,
			ends_at: event.ends_at,
			doors_open_at: event.doors_open_at,
			is_ticketed: event.is_ticketed,
			external_url: event.external_url,
		})
		.from(event)
		.leftJoin(file, eq(event.banner_file_id, file.id))
		.where(
			and(
				eq(event.venue_id, venueId),
				eq(event.visibility, "public"),
				eq(event.status, "published"),
				notDeleted(event),
			),
		)
		.orderBy(asc(event.starts_at));
}

export async function listEventFaqs(eventId) {
	return db
		.select()
		.from(event_faq)
		.where(and(eq(event_faq.event_id, eventId), notDeleted(event_faq)))
		.orderBy(asc(event_faq.sort_order));
}

export async function listEventRooms(eventId) {
	return db
		.select({ room_id: event_room.room_id })
		.from(event_room)
		.where(eq(event_room.event_id, eventId));
}

/**
 * Rooms used by an event, regardless of whether they come from event_room
 * (manually picked) or via the linked booking's segments.
 */
export async function listEventRoomsResolved(eventRow) {
	if (eventRow.booking_id) {
		return db
			.selectDistinct({ id: room.id, name: room.name, slug: room.slug })
			.from(booking_segment)
			.innerJoin(room, eq(booking_segment.room_id, room.id))
			.where(eq(booking_segment.booking_id, eventRow.booking_id))
			.orderBy(asc(room.sort_order), asc(room.name));
	}
	return db
		.select({ id: room.id, name: room.name, slug: room.slug })
		.from(event_room)
		.innerJoin(room, eq(event_room.room_id, room.id))
		.where(eq(event_room.event_id, eventRow.id))
		.orderBy(asc(room.sort_order), asc(room.name));
}

export async function listTicketTypes(eventId, { activeOnly = false } = {}) {
	const conditions = [eq(ticket_type.event_id, eventId), notDeleted(ticket_type)];
	if (activeOnly) conditions.push(eq(ticket_type.is_active, true));
	return db
		.select()
		.from(ticket_type)
		.where(and(...conditions))
		.orderBy(asc(ticket_type.sort_order));
}

export async function listTicketAddons(eventId, { activeOnly = false } = {}) {
	const conditions = [eq(ticket_addon.event_id, eventId), notDeleted(ticket_addon)];
	if (activeOnly) conditions.push(eq(ticket_addon.is_active, true));
	return db
		.select({
			id: ticket_addon.id,
			event_id: ticket_addon.event_id,
			group_id: ticket_addon.group_id,
			group_label: ticket_addon_group.label,
			group_sort_order: ticket_addon_group.sort_order,
			name: ticket_addon.name,
			description: ticket_addon.description,
			price_cents: ticket_addon.price_cents,
			vat_rate_id: ticket_addon.vat_rate_id,
			vat_inclusive: ticket_addon.vat_inclusive,
			max_quantity_per_ticket: ticket_addon.max_quantity_per_ticket,
			sort_order: ticket_addon.sort_order,
			is_active: ticket_addon.is_active,
		})
		.from(ticket_addon)
		.leftJoin(ticket_addon_group, eq(ticket_addon.group_id, ticket_addon_group.id))
		.where(and(...conditions))
		.orderBy(asc(ticket_addon.sort_order));
}

export async function listTicketAddonGroups(eventId) {
	return db
		.select()
		.from(ticket_addon_group)
		.where(and(eq(ticket_addon_group.event_id, eventId), notDeleted(ticket_addon_group)))
		.orderBy(asc(ticket_addon_group.sort_order));
}

export async function listTicketTypeAddonLinks(eventId) {
	const rows = await db
		.select({
			ticket_type_id: ticket_type_addon.ticket_type_id,
			addon_id: ticket_type_addon.addon_id,
		})
		.from(ticket_type_addon)
		.innerJoin(ticket_addon, eq(ticket_type_addon.addon_id, ticket_addon.id))
		.where(eq(ticket_addon.event_id, eventId));
	return rows;
}

export async function listTicketBundles(eventId) {
	const bundles = await db
		.select()
		.from(ticket_bundle)
		.where(and(eq(ticket_bundle.event_id, eventId), notDeleted(ticket_bundle)))
		.orderBy(asc(ticket_bundle.sort_order));
	if (!bundles.length) return [];
	const items = await db
		.select()
		.from(ticket_bundle_item)
		.where(inArray(ticket_bundle_item.bundle_id, bundles.map((b) => b.id)));
	const byBundle = new Map();
	for (const it of items) {
		if (!byBundle.has(it.bundle_id)) byBundle.set(it.bundle_id, []);
		byBundle.get(it.bundle_id).push(it);
	}
	return bundles.map((b) => ({ ...b, items: byBundle.get(b.id) ?? [] }));
}

/**
 * Total delegates already committed to this event (sum of quantity × admits_count
 * for ticket-kind lines on pending or paid orders).
 * Note: bundle lines decompose to ticket-kind sibling lines, so this naturally
 * covers bundles too.
 */
export async function getCommittedOccupancy(eventId) {
	const rows = await db
		.select({
			quantity: ticket_order_line.quantity,
			admits_count: ticket_type.admits_count,
		})
		.from(ticket_order_line)
		.innerJoin(ticket_order, eq(ticket_order_line.ticket_order_id, ticket_order.id))
		.innerJoin(ticket_type, eq(ticket_order_line.ticket_type_id, ticket_type.id))
		.where(
			and(
				eq(ticket_order.event_id, eventId),
				inArray(ticket_order.status, ["pending", "paid", "partially_refunded"]),
				eq(ticket_order_line.kind, "ticket"),
				isNull(ticket_order.deletedAt),
			),
		);
	return rows.reduce((sum, r) => sum + (r.quantity ?? 0) * (r.admits_count ?? 1), 0);
}

export async function listTicketDiscounts(eventId) {
	const discounts = await db
		.select()
		.from(ticket_discount)
		.where(and(eq(ticket_discount.event_id, eventId), notDeleted(ticket_discount)))
		.orderBy(asc(ticket_discount.sort_order));
	if (!discounts.length) return [];
	const links = await db
		.select()
		.from(ticket_discount_type)
		.where(inArray(ticket_discount_type.discount_id, discounts.map((d) => d.id)));
	const byDiscount = new Map();
	for (const l of links) {
		if (!byDiscount.has(l.discount_id)) byDiscount.set(l.discount_id, []);
		byDiscount.get(l.discount_id).push(l.ticket_type_id);
	}
	return discounts.map((d) => ({ ...d, ticket_type_ids: byDiscount.get(d.id) ?? [] }));
}
