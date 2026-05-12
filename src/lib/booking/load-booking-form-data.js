import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { listPublishedRooms } from "@/db/queries/rooms.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";
import { facility_package } from "@/db/schema/entities/facility_package.js";
import { facility_package_group } from "@/db/schema/entities/facility_package_group.js";
import { facility_category } from "@/db/schema/entities/facility_category.js";
import { room_booking_type } from "@/db/schema/entities/room_booking_type.js";
import { discount } from "@/db/schema/entities/discount.js";
import { getTicketingSettings } from "@/db/queries/settings.js";

/**
 * Loads everything the BookingWidget needs to render — rooms with their
 * offered booking types and facility packages, all bookingTypes,
 * active discounts, and ticketing settings. Shared between the public
 * `/book` page and the admin `/admin/bookings/new` page.
 */
export async function loadBookingFormData(venueId) {
	const ticketingSettings = await getTicketingSettings(venueId);
	const [rooms, bookingTypes, discounts] = await Promise.all([
		listPublishedRooms(venueId),
		db
			.select()
			.from(booking_type)
			.where(isNull(booking_type.deletedAt))
			.orderBy(asc(booking_type.sort_order), asc(booking_type.label)),
		db
			.select()
			.from(discount)
			.where(
				and(
					eq(discount.venue_id, venueId),
					eq(discount.is_active, true),
					isNull(discount.deletedAt),
				),
			)
			.orderBy(asc(discount.sort_order), asc(discount.label)),
	]);

	const roomIds = rooms.map((r) => r.id);
	const [facilityPkgs, offeredLinks] = roomIds.length
		? await Promise.all([
			db
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
				})
				.from(facility_package)
				.innerJoin(facility_category, eq(facility_package.category_id, facility_category.id))
				.leftJoin(facility_package_group, eq(facility_package.group_id, facility_package_group.id))
				.where(
					and(
						inArray(facility_package.room_id, roomIds),
						eq(facility_package.is_active, true),
						isNull(facility_package.deletedAt),
					),
				)
				.orderBy(asc(facility_category.sort_order), asc(facility_package.sort_order)),
			db
				.select()
				.from(room_booking_type)
				.where(inArray(room_booking_type.room_id, roomIds)),
		])
		: [[], []];

	const facilitiesByRoom = new Map(roomIds.map((id) => [id, []]));
	for (const p of facilityPkgs) facilitiesByRoom.get(p.room_id).push(p);

	const offeredByRoom = new Map(roomIds.map((id) => [id, new Set()]));
	for (const ot of offeredLinks) offeredByRoom.get(ot.room_id).add(ot.booking_type_id);

	const roomsWithExtras = rooms.map((r) => ({
		...r,
		facility_packages: facilitiesByRoom.get(r.id) ?? [],
		offered_booking_type_ids: [...(offeredByRoom.get(r.id) ?? [])],
	}));

	return {
		rooms: roomsWithExtras,
		bookingTypes,
		discounts,
		ticketingSettings,
	};
}
