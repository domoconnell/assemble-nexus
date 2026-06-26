import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { room } from "@/db/schema/entities/room.js";
import { room_content_block } from "@/db/schema/entities/room_content_block.js";
import { room_capacity } from "@/db/schema/entities/room_capacity.js";
import { capacity_layout } from "@/db/schema/entities/capacity_layout.js";
import { room_image } from "@/db/schema/entities/room_image.js";
import { facility_package } from "@/db/schema/entities/facility_package.js";
import { facility_package_group } from "@/db/schema/entities/facility_package_group.js";
import { facility_category } from "@/db/schema/entities/facility_category.js";
import { room_booking_type } from "@/db/schema/entities/room_booking_type.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";
import { file } from "@/db/schema/entities/file.js";

function notDeleted(table) {
    return isNull(table.deletedAt);
}

const baseRoomColumns = {
    id: room.id,
    venue_id: room.venue_id,
    slug: room.slug,
    name: room.name,
    tagline: room.tagline,
    short_description: room.short_description,
    content_html: room.content_html,
    av_highlight: room.av_highlight,
    accent_hue: room.accent_hue,
    allow_ticketed_events: room.allow_ticketed_events,
    ticketing_setup_fee_pct_x100: room.ticketing_setup_fee_pct_x100,
    buffer_minutes: room.buffer_minutes,
    sort_order: room.sort_order,
    is_published: room.is_published,
    is_public: room.is_public,
    updatedAt: room.updatedAt,
    hero_file_id: room.hero_file_id,
    hero_url: file.public_url,
};

export async function listCapacityLayouts() {
    return db
        .select()
        .from(capacity_layout)
        .where(notDeleted(capacity_layout))
        .orderBy(asc(capacity_layout.sort_order), asc(capacity_layout.label));
}

async function attachCapacities(rooms) {
    if (!rooms.length) return rooms;
    const ids = rooms.map((r) => r.id);
    const caps = await db
        .select({
            room_id: room_capacity.room_id,
            layout_id: room_capacity.layout_id,
            layout_key: capacity_layout.key,
            layout_label: capacity_layout.label,
            layout_icon: capacity_layout.icon,
            sort_order: capacity_layout.sort_order,
            value: room_capacity.value,
        })
        .from(room_capacity)
        .innerJoin(capacity_layout, eq(room_capacity.layout_id, capacity_layout.id))
        .where(inArray(room_capacity.room_id, ids))
        .orderBy(asc(capacity_layout.sort_order));
    const byRoom = new Map();
    for (const c of caps) {
        if (!byRoom.has(c.room_id)) byRoom.set(c.room_id, []);
        byRoom.get(c.room_id).push({
            layout_id: c.layout_id,
            key: c.layout_key,
            label: c.layout_label,
            icon: c.layout_icon,
            value: c.value,
        });
    }
    return rooms.map((r) => ({ ...r, capacities: byRoom.get(r.id) ?? [] }));
}

export async function listRoomsForAdmin(venueId) {
    const rooms = await db
        .select(baseRoomColumns)
        .from(room)
        .leftJoin(file, eq(room.hero_file_id, file.id))
        .where(and(eq(room.venue_id, venueId), notDeleted(room)))
        .orderBy(asc(room.sort_order), asc(room.name));
    return attachCapacities(rooms);
}

export async function listPublishedRooms(venueId) {
    const rooms = await db
        .select(baseRoomColumns)
        .from(room)
        .leftJoin(file, eq(room.hero_file_id, file.id))
        .where(
            and(
                eq(room.venue_id, venueId),
                eq(room.is_published, true),
                eq(room.is_public, true),
                notDeleted(room),
            ),
        )
        .orderBy(asc(room.sort_order), asc(room.name));
    return attachCapacities(rooms);
}

export async function getRoomById(id) {
    const [r] = await db
        .select()
        .from(room)
        .where(and(eq(room.id, id), notDeleted(room)))
        .limit(1);
    if (!r) return null;
    const [withCaps] = await attachCapacities([r]);
    return withCaps;
}

export async function getPublishedRoomBySlug(venueId, slug) {
    const rooms = await db
        .select(baseRoomColumns)
        .from(room)
        .leftJoin(file, eq(room.hero_file_id, file.id))
        .where(
            and(
                eq(room.venue_id, venueId),
                eq(room.slug, slug),
                eq(room.is_published, true),
                eq(room.is_public, true),
                notDeleted(room),
            ),
        )
        .limit(1);
    if (!rooms.length) return null;
    const [withCaps] = await attachCapacities(rooms);
    return withCaps;
}

export async function listRoomBlocks(roomId) {
    return db
        .select()
        .from(room_content_block)
        .where(and(eq(room_content_block.room_id, roomId), notDeleted(room_content_block)))
        .orderBy(asc(room_content_block.sort_order), asc(room_content_block.createdAt));
}

export async function listRoomImages(roomId, { kind = "gallery" } = {}) {
    return db
        .select({
            id: room_image.id,
            room_id: room_image.room_id,
            file_id: room_image.file_id,
            title: room_image.title,
            kind: room_image.kind,
            sort_order: room_image.sort_order,
            url: file.public_url,
            mime_type: file.mime_type,
        })
        .from(room_image)
        .innerJoin(file, eq(room_image.file_id, file.id))
        .where(
            and(
                eq(room_image.room_id, roomId),
                eq(room_image.kind, kind),
                isNull(room_image.deletedAt),
            ),
        )
        .orderBy(asc(room_image.sort_order), asc(room_image.createdAt));
}

export async function listFacilityCategories() {
    return db
        .select()
        .from(facility_category)
        .where(notDeleted(facility_category))
        .orderBy(asc(facility_category.sort_order), asc(facility_category.label));
}

export async function listFacilityPackages(roomId, { activeOnly = false } = {}) {
    const conditions = [eq(facility_package.room_id, roomId), notDeleted(facility_package)];
    if (activeOnly) conditions.push(eq(facility_package.is_active, true));

    return db
        .select({
            id: facility_package.id,
            room_id: facility_package.room_id,
            category_id: facility_package.category_id,
            category_key: facility_category.key,
            category_label: facility_category.label,
            category_icon: facility_category.icon,
            category_sort_order: facility_category.sort_order,
            group_id: facility_package.group_id,
            group_label: facility_package_group.label,
            group_sort_order: facility_package_group.sort_order,
            name: facility_package.name,
            summary: facility_package.summary,
            items: facility_package.items,
            price_cents: facility_package.price_cents,
            vat_rate_id: facility_package.vat_rate_id,
            vat_inclusive: facility_package.vat_inclusive,
            quantifiable: facility_package.quantifiable,
            sort_order: facility_package.sort_order,
            is_active: facility_package.is_active,
        })
        .from(facility_package)
        .innerJoin(facility_category, eq(facility_package.category_id, facility_category.id))
        .leftJoin(facility_package_group, eq(facility_package.group_id, facility_package_group.id))
        .where(and(...conditions))
        .orderBy(
            asc(facility_category.sort_order),
            asc(facility_package.sort_order),
            asc(facility_package.name),
        );
}

export async function listFacilityPackageGroups(roomId) {
    return db
        .select({
            id: facility_package_group.id,
            room_id: facility_package_group.room_id,
            category_id: facility_package_group.category_id,
            label: facility_package_group.label,
            sort_order: facility_package_group.sort_order,
        })
        .from(facility_package_group)
        .where(and(eq(facility_package_group.room_id, roomId), notDeleted(facility_package_group)))
        .orderBy(asc(facility_package_group.sort_order), asc(facility_package_group.label));
}

export async function listRoomBookingTypes(roomId) {
    return db
        .select({
            booking_type_id: room_booking_type.booking_type_id,
            key: booking_type.key,
            label: booking_type.label,
            description: booking_type.description,
            default_rate_modifier_x100: booking_type.default_rate_modifier_x100,
            sort_order: booking_type.sort_order,
        })
        .from(room_booking_type)
        .innerJoin(booking_type, eq(room_booking_type.booking_type_id, booking_type.id))
        .where(and(eq(room_booking_type.room_id, roomId), notDeleted(booking_type)))
        .orderBy(asc(booking_type.sort_order), asc(booking_type.label));
}

export async function getRoomCapacities(roomId) {
    return db
        .select({
            layout_id: room_capacity.layout_id,
            key: capacity_layout.key,
            label: capacity_layout.label,
            value: room_capacity.value,
        })
        .from(room_capacity)
        .innerJoin(capacity_layout, eq(room_capacity.layout_id, capacity_layout.id))
        .where(eq(room_capacity.room_id, roomId))
        .orderBy(asc(capacity_layout.sort_order));
}
