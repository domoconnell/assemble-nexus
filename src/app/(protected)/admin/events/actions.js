"use server";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/index.js";
import { event, EVENT_STATUSES } from "@/db/schema/entities/event.js";
import { event_faq } from "@/db/schema/entities/event_faq.js";
import { event_room } from "@/db/schema/entities/event_room.js";
import { booking_segment } from "@/db/schema/entities/booking_segment.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";
import { ticket_type } from "@/db/schema/entities/ticket_type.js";
import { ticket_addon } from "@/db/schema/entities/ticket_addon.js";
import { ticket_addon_group } from "@/db/schema/entities/ticket_addon_group.js";
import { ticket_type_addon } from "@/db/schema/entities/ticket_type_addon.js";
import { ticket_bundle } from "@/db/schema/entities/ticket_bundle.js";
import { ticket_bundle_item } from "@/db/schema/entities/ticket_bundle_item.js";
import { ticket_discount } from "@/db/schema/entities/ticket_discount.js";
import { ticket_discount_type } from "@/db/schema/entities/ticket_discount_type.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { ticket as ticketTable } from "@/db/schema/entities/ticket.js";
import { ticket_order_line } from "@/db/schema/entities/ticket_order_line.js";
import { getSucceededIntentForOrder } from "@/db/queries/orders.js";
import { getActivePsp } from "@/lib/psp/index.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { generateUniqueEventSlug } from "@/lib/events/slug.js";
import { generateUniqueCheckinCode, rotateCheckinCode } from "@/lib/events/checkin-code.js";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function gateAdmin() {
	return requireServerSession({ redirectTo: "/auth/login" });
}

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}


const EventBaseSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	slug: z.string().max(120).regex(slugRegex).optional().nullable(),
	title: z.string().min(1).max(200),
	summary: z.string().max(500).optional().nullable(),
	body_blocks: z.any().optional(),
	extra_info_blocks: z.any().optional(),
	banner_file_id: z.string().uuid().optional().nullable(),
	hero_file_id: z.string().uuid().optional().nullable(),
	gallery_photo_file_id: z.string().uuid().optional().nullable(),
	starts_at: z.string().optional().nullable(),
	ends_at: z.string().optional().nullable(),
	doors_open_at: z.string().optional().nullable(),
	booking_id: z.string().uuid().optional().nullable(),
	visibility: z.enum(["private", "public"]).optional().default("private"),
	status: z.enum(EVENT_STATUSES).optional(),
	is_ticketed: z.coerce.boolean().optional().default(false),
	max_occupancy: z.coerce.number().int().min(0).optional().nullable(),
	fee_pass_through: z.coerce.boolean().optional().default(false),
	event_organiser_id: z.string().uuid().optional().nullable(),
	organiser_organisation_id: z.string().uuid().optional().nullable(),
	external_url: z.string().max(500).optional().nullable(),
	commission_pct_x100: z.coerce.number().int().min(0).max(10000).optional().nullable(),
	commission_flat_cents: z.coerce.number().int().min(0).optional().nullable(),
	room_ids: z.array(z.string().uuid()).optional().default([]),
});

function toDate(v) {
	if (!v) return null;
	const d = new Date(v);
	return Number.isNaN(d.valueOf()) ? null : d;
}

export async function saveEventAction(input) {
	await gateAdmin();
	const parsed = EventBaseSchema.parse({
		...input,
		slug: nullify(input.slug),
		summary: nullify(input.summary),
		banner_file_id: nullify(input.banner_file_id),
		hero_file_id: nullify(input.hero_file_id),
		gallery_photo_file_id: nullify(input.gallery_photo_file_id),
		starts_at: nullify(input.starts_at),
		ends_at: nullify(input.ends_at),
		doors_open_at: nullify(input.doors_open_at),
		booking_id: nullify(input.booking_id),
		event_organiser_id: nullify(input.event_organiser_id),
		organiser_organisation_id: nullify(input.organiser_organisation_id),
		external_url: nullify(input.external_url),
	});

	// Events without a linked booking must have a CRM organisation set so the
	// ministry-gift formula and per-org roll-ups have a clear owner.
	if (!parsed.booking_id && !parsed.organiser_organisation_id) {
		throw new Error(
			"Pick a CRM organisation for this event - required when it isn't linked to a booking.",
		);
	}

	const venue = await requireCurrentVenue();

	// "When" times: the natural ordering applies always, plus a window
	// check when the (updated) event is tied to a booking. The window
	// list is derived from the booking's `event`-keyed segments — setup
	// / teardown / rehearsal slots don't count. The client gates Save on
	// the same rules; this layer stops a stale page or a direct API hit
	// from writing nonsense.
	//
	// We only revalidate the When fields that actually CHANGED versus
	// the row in the DB. Saving an unrelated tab (Page, Tickets, etc.)
	// rides the unchanged times through the payload — we must not refuse
	// those, otherwise a historical bad value would lock the whole event.
	let existingRow = null;
	if (parsed.id) {
		const [r] = await db
			.select({
				booking_id: event.booking_id,
				doors_open_at: event.doors_open_at,
				starts_at: event.starts_at,
				ends_at: event.ends_at,
			})
			.from(event)
			.where(eq(event.id, parsed.id))
			.limit(1);
		existingRow = r ?? null;
	}
	const sameInstant = (a, b) => {
		if (a == null && b == null) return true;
		if (a == null || b == null) return false;
		return new Date(a).getTime() === new Date(b).getTime();
	};
	const doorsChanged = !sameInstant(parsed.doors_open_at, existingRow?.doors_open_at);
	const startsChanged = !sameInstant(parsed.starts_at, existingRow?.starts_at);
	const endsChanged = !sameInstant(parsed.ends_at, existingRow?.ends_at);

	const doorsTs = parsed.doors_open_at ? new Date(parsed.doors_open_at).getTime() : null;
	const startsTs = parsed.starts_at ? new Date(parsed.starts_at).getTime() : null;
	const endsTs = parsed.ends_at ? new Date(parsed.ends_at).getTime() : null;
	if (
		(doorsChanged || startsChanged) &&
		doorsTs != null &&
		startsTs != null &&
		doorsTs > startsTs
	) {
		throw new Error("Doors must be on or before the start time.");
	}
	if (
		(startsChanged || endsChanged) &&
		startsTs != null &&
		endsTs != null &&
		startsTs > endsTs
	) {
		throw new Error("End time must be on or after the start time.");
	}
	if (
		(doorsChanged || endsChanged) &&
		doorsTs != null &&
		endsTs != null &&
		doorsTs > endsTs
	) {
		throw new Error("Doors must be on or before the end time.");
	}

	// Resolve the booking link for the window check: the payload's
	// `booking_id` wins; falls back to whatever's currently on the row
	// (in case the form omitted it).
	const bookingIdForWindow = parsed.booking_id ?? existingRow?.booking_id ?? null;
	if (
		bookingIdForWindow &&
		(doorsChanged || startsChanged || endsChanged) &&
		(doorsTs != null || startsTs != null || endsTs != null)
	) {
		const segs = await db
			.select({
				starts_at: booking_segment.starts_at,
				ends_at: booking_segment.ends_at,
				key: booking_type.key,
			})
			.from(booking_segment)
			.innerJoin(booking_type, eq(booking_type.id, booking_segment.booking_type_id))
			.where(
				and(
					eq(booking_segment.booking_id, bookingIdForWindow),
					isNull(booking_segment.deletedAt),
				),
			);
		const windows = segs
			.filter((s) => s.key === "event")
			.map((s) => ({
				start: new Date(s.starts_at).getTime(),
				end: new Date(s.ends_at).getTime(),
			}));
		const inWindow = (t) => windows.some((w) => t >= w.start && t <= w.end);
		if (windows.length > 0) {
			if (doorsChanged && doorsTs != null && !inWindow(doorsTs)) {
				throw new Error("Doors time is outside the booking's event-day window.");
			}
			if (startsChanged && startsTs != null && !inWindow(startsTs)) {
				throw new Error("Start time is outside the booking's event-day window.");
			}
			if (endsChanged && endsTs != null && !inWindow(endsTs)) {
				throw new Error("End time is outside the booking's event-day window.");
			}
		}
	}

	// Slug is server-owned. On insert: auto-generate. On update: keep existing.
	let slug;
	if (parsed.id) {
		const [existing] = await db
			.select({ slug: event.slug })
			.from(event)
			.where(eq(event.id, parsed.id))
			.limit(1);
		if (!existing) throw new Error("Event not found");
		slug = existing.slug;
	} else {
		slug = await generateUniqueEventSlug(venue.id, parsed.title);
	}

	const values = {
		venue_id: venue.id,
		slug,
		title: parsed.title,
		summary: parsed.summary ?? null,
		body_blocks: parsed.body_blocks ?? [],
		extra_info_blocks: parsed.extra_info_blocks ?? [],
		banner_file_id: parsed.banner_file_id ?? null,
		hero_file_id: parsed.hero_file_id ?? null,
		gallery_photo_file_id: parsed.gallery_photo_file_id ?? null,
		starts_at: toDate(parsed.starts_at),
		ends_at: toDate(parsed.ends_at),
		doors_open_at: toDate(parsed.doors_open_at),
		booking_id: parsed.booking_id ?? null,
		visibility: parsed.visibility ?? "private",
		is_ticketed: !!parsed.is_ticketed,
		max_occupancy: parsed.max_occupancy ?? null,
		fee_pass_through: !!parsed.fee_pass_through,
		event_organiser_id: parsed.event_organiser_id ?? null,
		organiser_organisation_id: parsed.organiser_organisation_id ?? null,
		external_url: parsed.external_url ?? null,
		commission_pct_x100: parsed.commission_pct_x100 ?? null,
		commission_flat_cents: parsed.commission_flat_cents ?? null,
	};
	if (parsed.status) values.status = parsed.status;

	let result;
	if (parsed.id) {
		// Belt and braces: only overwrite `booking_id` on update when the
		// payload actually included it. The admin event editor doesn't
		// expose booking_id as a field, so when the form is saved without
		// it (or with `undefined`), we'd otherwise nullify the link a
		// hirer-spawned event needs to stay accessible from /my-bookings.
		if (!Object.prototype.hasOwnProperty.call(input, "booking_id")) {
			delete values.booking_id;
		}
		[result] = await db
			.update(event)
			.set(values)
			.where(eq(event.id, parsed.id))
			.returning();
	} else {
		values.status = parsed.status ?? "draft";
		values.checkin_code = await generateUniqueCheckinCode();
		[result] = await db.insert(event).values(values).returning();
	}

	if (result?.id) {
		// When the event was spawned from a booking, the rooms are fixed:
		// they're whatever rooms the booking's segments use. The admin
		// editor hides the room picker in that case, but a stale payload
		// (or a future surface that forgets to lock it) shouldn't be able
		// to wipe the rooms — derive them from booking_segment instead.
		let roomIds = parsed.room_ids ?? [];
		if (result.booking_id) {
			const segs = await db
				.selectDistinct({ room_id: booking_segment.room_id })
				.from(booking_segment)
				.where(
					and(
						eq(booking_segment.booking_id, result.booking_id),
						isNull(booking_segment.deletedAt),
					),
				);
			roomIds = segs.map((s) => s.room_id).filter(Boolean);
		}
		await db.delete(event_room).where(eq(event_room.event_id, result.id));
		if (roomIds.length) {
			await db
				.insert(event_room)
				.values(roomIds.map((room_id) => ({ event_id: result.id, room_id })));
		}
	}

	revalidatePath("/admin/events");
	if (result?.id) revalidatePath(`/admin/events/${result.id}`);
	revalidatePath("/whats-on");
	revalidatePath(`/events/${result?.slug}`);
	return result;
}

export async function deleteEventAction(id) {
	await gateAdmin();
	const [e] = await db.select().from(event).where(eq(event.id, id)).limit(1);
	if (!e) return;
	await db.update(event).set({ deletedAt: new Date(), status: "cancelled" }).where(eq(event.id, id));
	revalidatePath("/admin/events");
	revalidatePath("/whats-on");
}

/**
 * One-click approve & publish for the pending-events dashboard widget.
 * Only flips events sitting at `pending_review`; everything else is a no-op
 * so accidental re-clicks on already-published rows can't change state.
 */
export async function publishEventAction(id) {
	await gateAdmin();
	const [e] = await db.select().from(event).where(eq(event.id, id)).limit(1);
	if (!e) return;
	if (e.status !== "pending_review") return e;
	const [updated] = await db
		.update(event)
		.set({ status: "published" })
		.where(eq(event.id, id))
		.returning();
	revalidatePath("/admin");
	revalidatePath("/admin/events");
	revalidatePath(`/admin/events/${id}`);
	revalidatePath("/whats-on");
	revalidatePath(`/events/${e.slug}`);
	return updated;
}

/**
 * Cancel (soft-cancel) an event without deleting it - leaves the row in
 * place for historical reporting but flips status to "cancelled". The
 * public page is removed from listings (filter excludes cancelled), and
 * the ledger / orders still link to it for refund-friendly accounting.
 */
export async function cancelEventAction(id) {
	await gateAdmin();
	const [e] = await db.select().from(event).where(eq(event.id, id)).limit(1);
	if (!e) return;
	if (e.status === "cancelled") return e;
	const [updated] = await db
		.update(event)
		.set({ status: "cancelled" })
		.where(eq(event.id, id))
		.returning();
	revalidatePath("/admin/events");
	revalidatePath(`/admin/events/${id}`);
	revalidatePath("/whats-on");
	revalidatePath(`/events/${e.slug}`);
	return updated;
}

const FaqRowSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	question: z.string().min(1).max(280),
	answer: z.string().min(1).max(4000),
});

const SaveFaqsSchema = z.object({
	event_id: z.string().uuid(),
	faqs: z.array(FaqRowSchema),
});

export async function saveEventFaqsAction(input) {
	await gateAdmin();
	const parsed = SaveFaqsSchema.parse(input);

	const existing = await db
		.select()
		.from(event_faq)
		.where(and(eq(event_faq.event_id, parsed.event_id), isNull(event_faq.deletedAt)));
	const existingIds = new Set(existing.map((e) => e.id));
	const keptIds = new Set(parsed.faqs.map((f) => f.id).filter(Boolean));

	const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
	if (toDelete.length) {
		await db
			.update(event_faq)
			.set({ deletedAt: new Date() })
			.where(inArray(event_faq.id, toDelete));
	}

	const saved = [];
	for (let i = 0; i < parsed.faqs.length; i++) {
		const f = parsed.faqs[i];
		if (f.id) {
			const [r] = await db
				.update(event_faq)
				.set({ question: f.question, answer: f.answer, sort_order: i })
				.where(eq(event_faq.id, f.id))
				.returning();
			saved.push(r);
		} else {
			const [r] = await db
				.insert(event_faq)
				.values({
					event_id: parsed.event_id,
					question: f.question,
					answer: f.answer,
					sort_order: i,
				})
				.returning();
			saved.push(r);
		}
	}

	revalidatePath(`/admin/events/${parsed.event_id}`);
	return saved;
}

const TicketTypeRowSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	name: z.string().min(1).max(120),
	description: z.string().max(500).optional().nullable(),
	price_cents: z.coerce.number().int().nonnegative(),
	vat_rate_id: z.string().uuid().optional().nullable(),
	vat_inclusive: z.coerce.boolean().optional().default(false),
	admits_count: z.coerce.number().int().min(1).max(50).optional().default(1),
	max_quantity: z.coerce.number().int().min(0).optional().nullable(),
	per_order_min: z.coerce.number().int().min(0).optional().default(0),
	per_order_max: z.coerce.number().int().min(0).optional().nullable(),
	is_active: z.coerce.boolean().optional().default(true),
});

const SaveTicketTypesSchema = z.object({
	event_id: z.string().uuid(),
	ticket_types: z.array(TicketTypeRowSchema),
});

const TicketAddonGroupRowSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	label: z.string().min(1).max(120),
});

const TicketAddonRowSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	group_id: z.string().uuid().optional().nullable(),
	name: z.string().min(1).max(160),
	description: z.string().max(500).optional().nullable(),
	price_cents: z.coerce.number().int().nonnegative(),
	vat_rate_id: z.string().uuid().optional().nullable(),
	vat_inclusive: z.coerce.boolean().optional().default(false),
	max_quantity_per_ticket: z.coerce.number().int().min(1).max(50).optional().default(1),
	is_active: z.coerce.boolean().optional().default(true),
	ticket_type_ids: z.array(z.string().uuid()).optional().default([]),
});

const SaveTicketAddonsSchema = z.object({
	event_id: z.string().uuid(),
	groups: z.array(TicketAddonGroupRowSchema),
	addons: z.array(TicketAddonRowSchema),
});

export async function saveTicketAddonsAction(input) {
	await gateAdmin();
	const parsed = SaveTicketAddonsSchema.parse({
		event_id: input.event_id,
		groups: input.groups ?? [],
		addons: (input.addons ?? []).map((a) => ({
			...a,
			description: nullify(a.description),
			vat_rate_id: nullify(a.vat_rate_id),
			group_id: nullify(a.group_id),
		})),
	});

	// Groups: diff-save (so we know remappings)
	const existingGroups = await db
		.select()
		.from(ticket_addon_group)
		.where(and(eq(ticket_addon_group.event_id, parsed.event_id), isNull(ticket_addon_group.deletedAt)));
	const existingGroupIds = new Set(existingGroups.map((g) => g.id));
	const keptGroupIds = new Set(parsed.groups.map((g) => g.id).filter(Boolean));

	const groupsToDelete = [...existingGroupIds].filter((id) => !keptGroupIds.has(id));
	if (groupsToDelete.length) {
		await db
			.update(ticket_addon_group)
			.set({ deletedAt: new Date() })
			.where(inArray(ticket_addon_group.id, groupsToDelete));
		// Detach addons that pointed at deleted groups
		await db
			.update(ticket_addon)
			.set({ group_id: null })
			.where(inArray(ticket_addon.group_id, groupsToDelete));
	}

	// Map of placeholder/temp ID -> real ID for new groups (so addons referencing
	// new groups by their incoming id resolve correctly)
	const groupIdMap = new Map();
	for (let i = 0; i < parsed.groups.length; i++) {
		const g = parsed.groups[i];
		if (g.id) {
			await db
				.update(ticket_addon_group)
				.set({ label: g.label, sort_order: i })
				.where(eq(ticket_addon_group.id, g.id));
			groupIdMap.set(g.id, g.id);
		} else {
			const [r] = await db
				.insert(ticket_addon_group)
				.values({ event_id: parsed.event_id, label: g.label, sort_order: i })
				.returning();
			// Allow the client to address the new group via a temporary id like `new-0`
			groupIdMap.set(`new-${i}`, r.id);
		}
	}

	// Addons: diff-save
	const existingAddons = await db
		.select()
		.from(ticket_addon)
		.where(and(eq(ticket_addon.event_id, parsed.event_id), isNull(ticket_addon.deletedAt)));
	const existingAddonIds = new Set(existingAddons.map((a) => a.id));
	const keptAddonIds = new Set(parsed.addons.map((a) => a.id).filter(Boolean));

	const addonsToDelete = [...existingAddonIds].filter((id) => !keptAddonIds.has(id));
	if (addonsToDelete.length) {
		await db
			.update(ticket_addon)
			.set({ deletedAt: new Date(), is_active: false })
			.where(inArray(ticket_addon.id, addonsToDelete));
		await db.delete(ticket_type_addon).where(inArray(ticket_type_addon.addon_id, addonsToDelete));
	}

	const savedAddons = [];
	for (let i = 0; i < parsed.addons.length; i++) {
		const a = parsed.addons[i];
		const resolvedGroupId = a.group_id ? groupIdMap.get(a.group_id) ?? a.group_id : null;
		const values = {
			event_id: parsed.event_id,
			group_id: resolvedGroupId,
			name: a.name,
			description: a.description ?? null,
			price_cents: a.price_cents ?? 0,
			vat_rate_id: a.vat_rate_id ?? null,
			vat_inclusive: !!a.vat_inclusive,
			max_quantity_per_ticket: a.max_quantity_per_ticket ?? 1,
			is_active: a.is_active !== false,
			sort_order: i,
		};
		let row;
		if (a.id) {
			[row] = await db
				.update(ticket_addon)
				.set(values)
				.where(eq(ticket_addon.id, a.id))
				.returning();
		} else {
			[row] = await db.insert(ticket_addon).values(values).returning();
		}
		savedAddons.push({ row, ticket_type_ids: a.ticket_type_ids ?? [] });
	}

	// Ticket-type links: clear and re-insert per addon
	const allAddonIds = savedAddons.map((s) => s.row.id);
	if (allAddonIds.length) {
		await db.delete(ticket_type_addon).where(inArray(ticket_type_addon.addon_id, allAddonIds));
		const links = [];
		for (const { row, ticket_type_ids } of savedAddons) {
			for (const ttId of ticket_type_ids) {
				links.push({ ticket_type_id: ttId, addon_id: row.id });
			}
		}
		if (links.length) {
			await db.insert(ticket_type_addon).values(links).onConflictDoNothing();
		}
	}

	revalidatePath(`/admin/events/${parsed.event_id}`);
	return {
		groups: await db
			.select()
			.from(ticket_addon_group)
			.where(and(eq(ticket_addon_group.event_id, parsed.event_id), isNull(ticket_addon_group.deletedAt)))
			.orderBy(asc(ticket_addon_group.sort_order)),
		addons: savedAddons.map((s) => ({ ...s.row, ticket_type_ids: s.ticket_type_ids })),
	};
}

const TicketBundleItemSchema = z.object({
	ticket_type_id: z.string().uuid(),
	quantity: z.coerce.number().int().min(1),
});

const TicketBundleRowSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	name: z.string().min(1).max(160),
	description: z.string().max(500).optional().nullable(),
	total_price_cents: z.coerce.number().int().nonnegative(),
	vat_rate_id: z.string().uuid().optional().nullable(),
	vat_inclusive: z.coerce.boolean().optional().default(false),
	is_active: z.coerce.boolean().optional().default(true),
	items: z.array(TicketBundleItemSchema).min(1),
});

const SaveTicketBundlesSchema = z.object({
	event_id: z.string().uuid(),
	bundles: z.array(TicketBundleRowSchema),
});

export async function saveTicketBundlesAction(input) {
	await gateAdmin();
	const parsed = SaveTicketBundlesSchema.parse({
		event_id: input.event_id,
		bundles: (input.bundles ?? []).map((b) => ({
			...b,
			description: nullify(b.description),
			vat_rate_id: nullify(b.vat_rate_id),
		})),
	});

	const existing = await db
		.select()
		.from(ticket_bundle)
		.where(and(eq(ticket_bundle.event_id, parsed.event_id), isNull(ticket_bundle.deletedAt)));
	const existingIds = new Set(existing.map((b) => b.id));
	const keptIds = new Set(parsed.bundles.map((b) => b.id).filter(Boolean));

	const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
	if (toDelete.length) {
		await db
			.update(ticket_bundle)
			.set({ deletedAt: new Date(), is_active: false })
			.where(inArray(ticket_bundle.id, toDelete));
		await db.delete(ticket_bundle_item).where(inArray(ticket_bundle_item.bundle_id, toDelete));
	}

	const saved = [];
	for (let i = 0; i < parsed.bundles.length; i++) {
		const b = parsed.bundles[i];
		const values = {
			event_id: parsed.event_id,
			name: b.name,
			description: b.description ?? null,
			total_price_cents: b.total_price_cents ?? 0,
			vat_rate_id: b.vat_rate_id ?? null,
			vat_inclusive: !!b.vat_inclusive,
			is_active: b.is_active !== false,
			sort_order: i,
		};
		let row;
		if (b.id) {
			[row] = await db
				.update(ticket_bundle)
				.set(values)
				.where(eq(ticket_bundle.id, b.id))
				.returning();
		} else {
			[row] = await db.insert(ticket_bundle).values(values).returning();
		}

		await db.delete(ticket_bundle_item).where(eq(ticket_bundle_item.bundle_id, row.id));
		if (b.items.length) {
			await db
				.insert(ticket_bundle_item)
				.values(b.items.map((it) => ({
					bundle_id: row.id,
					ticket_type_id: it.ticket_type_id,
					quantity: it.quantity,
				})))
				.onConflictDoNothing();
		}
		saved.push({ ...row, items: b.items });
	}

	revalidatePath(`/admin/events/${parsed.event_id}`);
	return saved;
}

const TicketDiscountRowSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	label: z.string().min(1).max(160),
	trigger: z.enum(["auto", "code"]),
	code: z.string().max(80).optional().nullable(),
	kind: z.enum(["percent", "fixed_cents", "nth_free"]),
	value_x100: z.coerce.number().int().min(0).max(10000).optional().nullable(),
	value_cents: z.coerce.number().int().min(0).optional().nullable(),
	n_free: z.coerce.number().int().min(1).optional().nullable(),
	min_qty: z.coerce.number().int().min(0).optional().nullable(),
	max_uses: z.coerce.number().int().min(0).optional().nullable(),
	starts_at: z.string().optional().nullable(),
	ends_at: z.string().optional().nullable(),
	is_active: z.coerce.boolean().optional().default(true),
	ticket_type_ids: z.array(z.string().uuid()).optional().default([]),
});

const SaveTicketDiscountsSchema = z.object({
	event_id: z.string().uuid(),
	discounts: z.array(TicketDiscountRowSchema),
});

export async function saveTicketDiscountsAction(input) {
	await gateAdmin();
	const parsed = SaveTicketDiscountsSchema.parse({
		event_id: input.event_id,
		discounts: (input.discounts ?? []).map((d) => ({
			...d,
			code: nullify(d.code),
			starts_at: nullify(d.starts_at),
			ends_at: nullify(d.ends_at),
		})),
	});

	const existing = await db
		.select()
		.from(ticket_discount)
		.where(and(eq(ticket_discount.event_id, parsed.event_id), isNull(ticket_discount.deletedAt)));
	const existingIds = new Set(existing.map((d) => d.id));
	const keptIds = new Set(parsed.discounts.map((d) => d.id).filter(Boolean));

	const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
	if (toDelete.length) {
		await db
			.update(ticket_discount)
			.set({ deletedAt: new Date(), is_active: false })
			.where(inArray(ticket_discount.id, toDelete));
		await db.delete(ticket_discount_type).where(inArray(ticket_discount_type.discount_id, toDelete));
	}

	const saved = [];
	for (let i = 0; i < parsed.discounts.length; i++) {
		const d = parsed.discounts[i];
		const values = {
			event_id: parsed.event_id,
			label: d.label,
			trigger: d.trigger,
			code: d.trigger === "code" ? (d.code ?? null) : null,
			kind: d.kind,
			value_x100: d.kind === "percent" ? (d.value_x100 ?? null) : null,
			value_cents: d.kind === "fixed_cents" ? (d.value_cents ?? null) : null,
			n_free: d.kind === "nth_free" ? (d.n_free ?? null) : null,
			min_qty: d.min_qty ?? null,
			max_uses: d.max_uses ?? null,
			starts_at: toDate(d.starts_at),
			ends_at: toDate(d.ends_at),
			is_active: d.is_active !== false,
			sort_order: i,
		};
		let row;
		if (d.id) {
			[row] = await db
				.update(ticket_discount)
				.set(values)
				.where(eq(ticket_discount.id, d.id))
				.returning();
		} else {
			[row] = await db.insert(ticket_discount).values(values).returning();
		}

		await db.delete(ticket_discount_type).where(eq(ticket_discount_type.discount_id, row.id));
		if (d.ticket_type_ids?.length) {
			await db
				.insert(ticket_discount_type)
				.values(
					d.ticket_type_ids.map((ticket_type_id) => ({
						discount_id: row.id,
						ticket_type_id,
					})),
				)
				.onConflictDoNothing();
		}
		saved.push({ ...row, ticket_type_ids: d.ticket_type_ids ?? [] });
	}

	revalidatePath(`/admin/events/${parsed.event_id}`);
	return saved;
}

export async function saveTicketTypesAction(input) {
	await gateAdmin();
	const parsed = SaveTicketTypesSchema.parse({
		...input,
		ticket_types: (input.ticket_types ?? []).map((t) => ({
			...t,
			description: nullify(t.description),
			vat_rate_id: nullify(t.vat_rate_id),
		})),
	});

	const existing = await db
		.select()
		.from(ticket_type)
		.where(and(eq(ticket_type.event_id, parsed.event_id), isNull(ticket_type.deletedAt)));
	const existingIds = new Set(existing.map((t) => t.id));
	const keptIds = new Set(parsed.ticket_types.map((t) => t.id).filter(Boolean));

	const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
	if (toDelete.length) {
		await db
			.update(ticket_type)
			.set({ deletedAt: new Date(), is_active: false })
			.where(inArray(ticket_type.id, toDelete));
	}

	const saved = [];
	for (let i = 0; i < parsed.ticket_types.length; i++) {
		const t = parsed.ticket_types[i];
		const values = {
			event_id: parsed.event_id,
			name: t.name,
			description: t.description ?? null,
			price_cents: t.price_cents ?? 0,
			vat_rate_id: t.vat_rate_id ?? null,
			vat_inclusive: !!t.vat_inclusive,
			admits_count: t.admits_count ?? 1,
			max_quantity: t.max_quantity ?? null,
			per_order_min: t.per_order_min ?? 0,
			per_order_max: t.per_order_max ?? null,
			is_active: t.is_active !== false,
			sort_order: i,
		};
		if (t.id) {
			const [r] = await db
				.update(ticket_type)
				.set(values)
				.where(eq(ticket_type.id, t.id))
				.returning();
			saved.push(r);
		} else {
			const [r] = await db.insert(ticket_type).values(values).returning();
			saved.push(r);
		}
	}

	revalidatePath(`/admin/events/${parsed.event_id}`);
	return saved;
}

const RefundOrderSchema = z.object({
	order_id: z.string().uuid(),
	amount_cents: z.coerce.number().int().min(1).optional().nullable(),
});

/**
 * Refund a ticket order via the active PSP. Defaults to a full refund if no
 * amount is provided. Voids the order's tickets and flips order status.
 */
export async function refundTicketOrderAction(input) {
	await gateAdmin();
	const parsed = RefundOrderSchema.parse(input);

	const [order] = await db
		.select()
		.from(ticket_order)
		.where(eq(ticket_order.id, parsed.order_id))
		.limit(1);
	if (!order) throw new Error("Order not found");
	if (order.status !== "paid" && order.status !== "partially_refunded") {
		throw new Error(`Cannot refund an order with status "${order.status}".`);
	}

	const intent = await getSucceededIntentForOrder(order.id);
	if (!intent) throw new Error("No succeeded payment intent on this order.");

	const venue = await requireCurrentVenue();
	const psp = await getActivePsp(venue.id);
	if (psp.key !== intent.provider) {
		throw new Error(
			`Active PSP is "${psp.key}" but this order was paid via "${intent.provider}".`,
		);
	}

	const refundAmount = parsed.amount_cents ?? order.total_cents;
	if (refundAmount > order.total_cents) {
		throw new Error("Refund cannot exceed the order total.");
	}

	await psp.createRefund({ intent_id: intent.external_id, amount_cents: refundAmount });

	const fullyRefunded = refundAmount >= order.total_cents;
	const now = new Date();
	await db
		.update(ticket_order)
		.set({
			status: fullyRefunded ? "refunded" : "partially_refunded",
			cancelled_at: fullyRefunded ? now : order.cancelled_at,
		})
		.where(eq(ticket_order.id, order.id));

	if (fullyRefunded) {
		// Void every ticket on this order.
		const lines = await db
			.select({ id: ticket_order_line.id })
			.from(ticket_order_line)
			.where(
				and(
					eq(ticket_order_line.ticket_order_id, order.id),
					eq(ticket_order_line.kind, "ticket"),
				),
			);
		const lineIds = lines.map((l) => l.id);
		if (lineIds.length) {
			await db
				.update(ticketTable)
				.set({ status: "refunded" })
				.where(inArray(ticketTable.ticket_order_line_id, lineIds));
		}
	}

	revalidatePath(`/admin/events/${order.event_id}`);
	revalidatePath(`/my-orders/${order.reference}`);
	return { refunded_cents: refundAmount, fullyRefunded };
}

export async function rotateEventCheckinCodeAction(eventId) {
	await gateAdmin();
	const code = await rotateCheckinCode(eventId);
	revalidatePath(`/admin/events/${eventId}`);
	return { checkin_code: code };
}

export async function ensureEventCheckinCodeAction(eventId) {
	await gateAdmin();
	const [row] = await db
		.select({ checkin_code: event.checkin_code })
		.from(event)
		.where(eq(event.id, eventId))
		.limit(1);
	if (row?.checkin_code) return { checkin_code: row.checkin_code };
	const code = await generateUniqueCheckinCode();
	await db.update(event).set({ checkin_code: code }).where(eq(event.id, eventId));
	revalidatePath(`/admin/events/${eventId}`);
	return { checkin_code: code };
}
