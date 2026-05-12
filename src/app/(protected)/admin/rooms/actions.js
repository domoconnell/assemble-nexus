"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/index.js";
import { room } from "@/db/schema/entities/room.js";
import { room_capacity } from "@/db/schema/entities/room_capacity.js";
import { room_content_block, BLOCK_TYPES, BLOCK_SECTIONS } from "@/db/schema/entities/room_content_block.js";
import { room_image } from "@/db/schema/entities/room_image.js";
import { facility_package } from "@/db/schema/entities/facility_package.js";
import { facility_package_group } from "@/db/schema/entities/facility_package_group.js";
import { room_booking_type } from "@/db/schema/entities/room_booking_type.js";
import { pricing_rule } from "@/db/schema/entities/pricing_rule.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { deleteFile } from "@/utils/files/files.server.js";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CapacityEntrySchema = z.object({
	layout_id: z.string().uuid(),
	value: z.coerce.number().int().nonnegative().nullable().optional(),
});

const RoomSaveSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	slug: z.string().min(1).max(80).regex(slugRegex, "Slug must be lowercase letters, numbers, and dashes."),
	name: z.string().min(1).max(120),
	tagline: z.string().max(280).optional().nullable(),
	short_description: z.string().max(2000).optional().nullable(),
	hero_file_id: z.string().uuid().optional().nullable(),
	av_highlight: z.string().max(280).optional().nullable(),
	accent_hue: z.string().max(280).optional().nullable(),
	allow_ticketed_events: z.coerce.boolean().optional().default(false),
	ticketing_setup_fee_pct_x100: z.coerce.number().int().min(0).max(10000).optional().default(0),
	buffer_minutes: z.coerce.number().int().min(0).max(720).optional().default(60),
	sort_order: z.coerce.number().int().optional().default(0),
	is_published: z.coerce.boolean().optional().default(false),
	capacities: z.array(CapacityEntrySchema).optional().default([]),
});

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

async function gateAdmin() {
	const session = await requireServerSession({ redirectTo: "/auth/login" });
	return session;
}

export async function saveRoomAction(input) {
	await gateAdmin();
	const parsed = RoomSaveSchema.parse({
		...input,
		tagline: nullify(input.tagline),
		short_description: nullify(input.short_description),
		hero_file_id: nullify(input.hero_file_id),
		av_highlight: nullify(input.av_highlight),
		accent_hue: nullify(input.accent_hue),
	});

	const venue = await requireCurrentVenue();

	const values = {
		venue_id: venue.id,
		slug: parsed.slug,
		name: parsed.name,
		tagline: parsed.tagline ?? null,
		short_description: parsed.short_description ?? null,
		hero_file_id: parsed.hero_file_id ?? null,
		av_highlight: parsed.av_highlight ?? null,
		accent_hue: parsed.accent_hue ?? null,
		allow_ticketed_events: !!parsed.allow_ticketed_events,
		ticketing_setup_fee_pct_x100: parsed.ticketing_setup_fee_pct_x100 ?? 0,
		buffer_minutes: parsed.buffer_minutes ?? 60,
		sort_order: parsed.sort_order ?? 0,
		is_published: !!parsed.is_published,
	};

	let result;
	if (parsed.id) {
		[result] = await db.update(room).set(values).where(eq(room.id, parsed.id)).returning();
	} else {
		[result] = await db.insert(room).values(values).returning();
	}

	if (result?.id) {
		await db.delete(room_capacity).where(eq(room_capacity.room_id, result.id));
		const capacityRows = parsed.capacities
			.filter((c) => c.value != null && Number(c.value) > 0)
			.map((c) => ({ room_id: result.id, layout_id: c.layout_id, value: Number(c.value) }));
		if (capacityRows.length) {
			await db.insert(room_capacity).values(capacityRows);
		}
	}

	revalidatePath("/");
	revalidatePath("/rooms");
	revalidatePath(`/rooms/${parsed.slug}`);
	revalidatePath("/admin/rooms");
	if (result?.id) revalidatePath(`/admin/rooms/${result.id}`);
	return result;
}

export async function deleteRoomAction(id) {
	await gateAdmin();
	const [r] = await db.select().from(room).where(eq(room.id, id)).limit(1);
	if (!r) return;
	await db.update(room).set({ deletedAt: new Date(), is_published: false }).where(eq(room.id, id));
	revalidatePath("/");
	revalidatePath("/rooms");
	revalidatePath(`/rooms/${r.slug}`);
	revalidatePath("/admin/rooms");
}

const BlockUpsertSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	room_id: z.string().uuid(),
	type: z.enum(BLOCK_TYPES),
	section: z.enum(BLOCK_SECTIONS).optional().nullable(),
	category: z.string().min(1).max(80).optional().nullable(),
	payload: z.record(z.string(), z.any()).optional().default({}),
	sort_order: z.coerce.number().int().optional(),
});

export async function upsertBlockAction(input) {
	await gateAdmin();
	const parsed = BlockUpsertSchema.parse({
		...input,
		section: nullify(input.section),
		category: nullify(input.category),
	});

	let result;
	if (parsed.id) {
		const values = {
			type: parsed.type,
			section: parsed.section ?? null,
			category: parsed.category ?? null,
			payload: parsed.payload,
		};
		if (parsed.sort_order != null) values.sort_order = parsed.sort_order;
		[result] = await db
			.update(room_content_block)
			.set(values)
			.where(eq(room_content_block.id, parsed.id))
			.returning();
	} else {
		const existing = await db
			.select({ sort_order: room_content_block.sort_order })
			.from(room_content_block)
			.where(eq(room_content_block.room_id, parsed.room_id))
			.orderBy(asc(room_content_block.sort_order));
		const nextOrder = existing.length ? Math.max(...existing.map((e) => e.sort_order)) + 1 : 0;
		[result] = await db
			.insert(room_content_block)
			.values({
				room_id: parsed.room_id,
				type: parsed.type,
				section: parsed.section ?? null,
				category: parsed.category ?? null,
				payload: parsed.payload,
				sort_order: parsed.sort_order ?? nextOrder,
			})
			.returning();
	}

	const [r] = await db.select({ slug: room.slug }).from(room).where(eq(room.id, parsed.room_id)).limit(1);
	if (r) revalidatePath(`/rooms/${r.slug}`);
	revalidatePath(`/admin/rooms/${parsed.room_id}`);
	return result;
}

export async function deleteBlockAction(blockId) {
	await gateAdmin();
	const [b] = await db
		.select({ id: room_content_block.id, room_id: room_content_block.room_id })
		.from(room_content_block)
		.where(eq(room_content_block.id, blockId))
		.limit(1);
	if (!b) return;
	await db.delete(room_content_block).where(eq(room_content_block.id, blockId));
	const [r] = await db.select({ slug: room.slug }).from(room).where(eq(room.id, b.room_id)).limit(1);
	if (r) revalidatePath(`/rooms/${r.slug}`);
	revalidatePath(`/admin/rooms/${b.room_id}`);
}

async function revalidateRoomById(roomId) {
	const [r] = await db.select({ slug: room.slug }).from(room).where(eq(room.id, roomId)).limit(1);
	if (r) revalidatePath(`/rooms/${r.slug}`);
	revalidatePath(`/admin/rooms/${roomId}`);
}

const ImageAddSchema = z.object({
	room_id: z.string().uuid(),
	file_id: z.string().uuid(),
	title: z.string().max(280).optional().nullable(),
});

export async function addRoomImageAction(input) {
	await gateAdmin();
	const parsed = ImageAddSchema.parse({ ...input, title: nullify(input.title) });
	const existing = await db
		.select({ sort_order: room_image.sort_order })
		.from(room_image)
		.where(eq(room_image.room_id, parsed.room_id));
	const nextOrder = existing.length ? Math.max(...existing.map((e) => e.sort_order)) + 1 : 0;
	const [created] = await db
		.insert(room_image)
		.values({
			room_id: parsed.room_id,
			file_id: parsed.file_id,
			title: parsed.title ?? null,
			kind: "gallery",
			sort_order: nextOrder,
		})
		.returning();
	await revalidateRoomById(parsed.room_id);
	return created;
}

const ImageUpdateSchema = z.object({
	id: z.string().uuid(),
	title: z.string().max(280).optional().nullable(),
});

export async function updateRoomImageAction(input) {
	await gateAdmin();
	const parsed = ImageUpdateSchema.parse({ ...input, title: nullify(input.title) });
	const [updated] = await db
		.update(room_image)
		.set({ title: parsed.title ?? null })
		.where(eq(room_image.id, parsed.id))
		.returning();
	if (updated) await revalidateRoomById(updated.room_id);
	return updated;
}

export async function deleteRoomImageAction(imageId) {
	await gateAdmin();
	const [img] = await db
		.select()
		.from(room_image)
		.where(eq(room_image.id, imageId))
		.limit(1);
	if (!img) return;
	await db.delete(room_image).where(eq(room_image.id, imageId));
	if (img.file_id) await deleteFile(img.file_id);
	await revalidateRoomById(img.room_id);
}

export async function moveRoomImageAction(imageId, direction) {
	await gateAdmin();
	if (direction !== "up" && direction !== "down") return;

	const [img] = await db
		.select()
		.from(room_image)
		.where(eq(room_image.id, imageId))
		.limit(1);
	if (!img) return;

	const siblings = await db
		.select()
		.from(room_image)
		.where(and(eq(room_image.room_id, img.room_id), eq(room_image.kind, img.kind), isNull(room_image.deletedAt)))
		.orderBy(asc(room_image.sort_order), asc(room_image.createdAt));

	const idx = siblings.findIndex((s) => s.id === imageId);
	if (idx < 0) return;
	const swapIdx = direction === "up" ? idx - 1 : idx + 1;
	if (swapIdx < 0 || swapIdx >= siblings.length) return;

	const a = siblings[idx];
	const c = siblings[swapIdx];

	await db.update(room_image).set({ sort_order: c.sort_order }).where(eq(room_image.id, a.id));
	await db.update(room_image).set({ sort_order: a.sort_order }).where(eq(room_image.id, c.id));

	await revalidateRoomById(img.room_id);
}

export async function moveBlockAction(blockId, direction) {
	await gateAdmin();
	if (direction !== "up" && direction !== "down") return;

	const [b] = await db
		.select()
		.from(room_content_block)
		.where(eq(room_content_block.id, blockId))
		.limit(1);
	if (!b) return;

	const sameSection = b.section == null
		? isNull(room_content_block.section)
		: eq(room_content_block.section, b.section);
	const sameCategory = b.category == null
		? isNull(room_content_block.category)
		: eq(room_content_block.category, b.category);

	const siblings = await db
		.select()
		.from(room_content_block)
		.where(and(eq(room_content_block.room_id, b.room_id), sameSection, sameCategory))
		.orderBy(asc(room_content_block.sort_order), asc(room_content_block.createdAt));

	const idx = siblings.findIndex((s) => s.id === blockId);
	if (idx < 0) return;
	const swapIdx = direction === "up" ? idx - 1 : idx + 1;
	if (swapIdx < 0 || swapIdx >= siblings.length) return;

	const a = siblings[idx];
	const c = siblings[swapIdx];

	await db.update(room_content_block).set({ sort_order: c.sort_order }).where(eq(room_content_block.id, a.id));
	await db.update(room_content_block).set({ sort_order: a.sort_order }).where(eq(room_content_block.id, c.id));

	const [r] = await db.select({ slug: room.slug }).from(room).where(eq(room.id, b.room_id)).limit(1);
	if (r) revalidatePath(`/rooms/${r.slug}`);
	revalidatePath(`/admin/rooms/${b.room_id}`);
}

const FacilityPackageSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	room_id: z.string().uuid(),
	category_id: z.string().uuid(),
	group_id: z.string().uuid().optional().nullable(),
	name: z.string().min(1).max(200),
	summary: z.string().max(500).optional().nullable(),
	items: z.array(z.object({ label: z.string().max(120), value: z.string().max(280) })).optional().default([]),
	price_cents: z.coerce.number().int().nonnegative().optional().default(0),
	vat_rate_id: z.string().uuid().optional().nullable(),
	vat_inclusive: z.coerce.boolean().optional().default(false),
	quantifiable: z.coerce.boolean().optional().default(false),
	is_active: z.coerce.boolean().optional().default(true),
	sort_order: z.coerce.number().int().optional(),
});

export async function saveFacilityPackageAction(input) {
	await gateAdmin();
	const parsed = FacilityPackageSchema.parse({
		...input,
		summary: nullify(input.summary),
		vat_rate_id: nullify(input.vat_rate_id),
		group_id: nullify(input.group_id),
	});

	const values = {
		room_id: parsed.room_id,
		category_id: parsed.category_id,
		group_id: parsed.group_id ?? null,
		name: parsed.name,
		summary: parsed.summary ?? null,
		items: parsed.items ?? [],
		price_cents: parsed.price_cents ?? 0,
		vat_rate_id: parsed.vat_rate_id ?? null,
		vat_inclusive: !!parsed.vat_inclusive,
		quantifiable: !!parsed.quantifiable,
		is_active: !!parsed.is_active,
	};

	let result;
	if (parsed.id) {
		[result] = await db.update(facility_package).set(values).where(eq(facility_package.id, parsed.id)).returning();
	} else {
		const existing = await db
			.select({ sort_order: facility_package.sort_order })
			.from(facility_package)
			.where(eq(facility_package.room_id, parsed.room_id));
		const nextOrder = existing.length ? Math.max(...existing.map((e) => e.sort_order)) + 1 : 0;
		[result] = await db
			.insert(facility_package)
			.values({ ...values, sort_order: parsed.sort_order ?? nextOrder })
			.returning();
	}

	await revalidateRoomById(parsed.room_id);
	return result;
}

export async function deleteFacilityPackageAction(id) {
	await gateAdmin();
	const [pkg] = await db.select().from(facility_package).where(eq(facility_package.id, id)).limit(1);
	if (!pkg) return;
	await db.update(facility_package).set({ deletedAt: new Date(), is_active: false }).where(eq(facility_package.id, id));
	await revalidateRoomById(pkg.room_id);
}

export async function moveFacilityPackageAction(id, direction) {
	await gateAdmin();
	if (direction !== "up" && direction !== "down") return;
	const [pkg] = await db.select().from(facility_package).where(eq(facility_package.id, id)).limit(1);
	if (!pkg) return;
	const siblings = await db
		.select()
		.from(facility_package)
		.where(
			and(
				eq(facility_package.room_id, pkg.room_id),
				eq(facility_package.category_id, pkg.category_id),
				isNull(facility_package.deletedAt),
			),
		)
		.orderBy(asc(facility_package.sort_order), asc(facility_package.createdAt));
	const idx = siblings.findIndex((s) => s.id === id);
	if (idx < 0) return;
	const swapIdx = direction === "up" ? idx - 1 : idx + 1;
	if (swapIdx < 0 || swapIdx >= siblings.length) return;
	const a = siblings[idx];
	const c = siblings[swapIdx];
	await db.update(facility_package).set({ sort_order: c.sort_order }).where(eq(facility_package.id, a.id));
	await db.update(facility_package).set({ sort_order: a.sort_order }).where(eq(facility_package.id, c.id));
	await revalidateRoomById(pkg.room_id);
}

const FacilityGroupSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	room_id: z.string().uuid(),
	category_id: z.string().uuid(),
	label: z.string().min(1).max(120),
});

export async function saveFacilityGroupAction(input) {
	await gateAdmin();
	const parsed = FacilityGroupSchema.parse(input);
	let result;
	if (parsed.id) {
		[result] = await db
			.update(facility_package_group)
			.set({ label: parsed.label })
			.where(eq(facility_package_group.id, parsed.id))
			.returning();
	} else {
		const existing = await db
			.select({ sort_order: facility_package_group.sort_order })
			.from(facility_package_group)
			.where(
				and(
					eq(facility_package_group.room_id, parsed.room_id),
					eq(facility_package_group.category_id, parsed.category_id),
				),
			);
		const nextOrder = existing.length ? Math.max(...existing.map((e) => e.sort_order)) + 1 : 0;
		[result] = await db
			.insert(facility_package_group)
			.values({
				room_id: parsed.room_id,
				category_id: parsed.category_id,
				label: parsed.label,
				sort_order: nextOrder,
			})
			.returning();
	}
	await revalidateRoomById(parsed.room_id);
	return result;
}

export async function deleteFacilityGroupAction(id) {
	await gateAdmin();
	const [g] = await db.select().from(facility_package_group).where(eq(facility_package_group.id, id)).limit(1);
	if (!g) return;
	await db.update(facility_package).set({ group_id: null }).where(eq(facility_package.group_id, id));
	await db
		.update(facility_package_group)
		.set({ deletedAt: new Date() })
		.where(eq(facility_package_group.id, id));
	await revalidateRoomById(g.room_id);
}

const RoomBookingTypesSchema = z.object({
	room_id: z.string().uuid(),
	booking_type_ids: z.array(z.string().uuid()),
});

export async function setRoomBookingTypesAction(input) {
	await gateAdmin();
	const parsed = RoomBookingTypesSchema.parse(input);
	await db.delete(room_booking_type).where(eq(room_booking_type.room_id, parsed.room_id));
	if (parsed.booking_type_ids.length) {
		await db
			.insert(room_booking_type)
			.values(parsed.booking_type_ids.map((id, i) => ({ room_id: parsed.room_id, booking_type_id: id, sort_order: i })));
	}
	await revalidateRoomById(parsed.room_id);
}

const RoomPricingRowSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	booking_type_id: z.string().uuid(),
	amount_cents: z.coerce.number().int().nonnegative(),
	daily_cap_cents: z.coerce.number().int().nonnegative().optional().nullable(),
	min_hours: z.coerce.number().int().nonnegative().optional().nullable(),
	vat_rate_id: z.string().uuid().optional().nullable(),
	vat_inclusive: z.coerce.boolean().optional().default(false),
});

const RoomPricingSchema = z.object({
	room_id: z.string().uuid(),
	rules: z.array(RoomPricingRowSchema),
});

export async function saveRoomPricingAction(input) {
	await gateAdmin();
	const cleaned = {
		...input,
		rules: (input.rules ?? []).map((r) => ({
			...r,
			id: nullify(r.id),
			daily_cap_cents: nullify(r.daily_cap_cents),
			min_hours: nullify(r.min_hours),
			vat_rate_id: nullify(r.vat_rate_id),
		})),
	};
	const parsed = RoomPricingSchema.parse(cleaned);
	const venue = await requireCurrentVenue();

	const saved = [];
	for (const r of parsed.rules) {
		const values = {
			venue_id: venue.id,
			room_id: parsed.room_id,
			booking_type_id: r.booking_type_id,
			rate_kind: "hourly",
			amount_cents: r.amount_cents,
			daily_cap_cents: r.daily_cap_cents ?? null,
			vat_rate_id: r.vat_rate_id ?? null,
			vat_inclusive: !!r.vat_inclusive,
			min_hours: r.min_hours ?? null,
			applies_from: null,
			applies_to: null,
			notes: null,
			sort_order: 0,
		};

		let result;
		if (r.id) {
			[result] = await db.update(pricing_rule).set(values).where(eq(pricing_rule.id, r.id)).returning();
		} else {
			const [existing] = await db
				.select()
				.from(pricing_rule)
				.where(
					and(
						eq(pricing_rule.venue_id, venue.id),
						eq(pricing_rule.room_id, parsed.room_id),
						eq(pricing_rule.booking_type_id, r.booking_type_id),
						isNull(pricing_rule.deletedAt),
					),
				)
				.limit(1);
			if (existing) {
				[result] = await db
					.update(pricing_rule)
					.set(values)
					.where(eq(pricing_rule.id, existing.id))
					.returning();
			} else {
				[result] = await db.insert(pricing_rule).values(values).returning();
			}
		}
		saved.push(result);
	}

	await revalidateRoomById(parsed.room_id);
	return saved;
}
