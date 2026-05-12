import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
	getRoomById,
	listRoomBlocks,
	listCapacityLayouts,
	listRoomImages,
	listFacilityPackages,
	listFacilityPackageGroups,
	listFacilityCategories,
	listRoomBookingTypes,
} from "@/db/queries/rooms";
import { getFileRecord } from "@/utils/files/files.server";
import { pricing_rule } from "@/db/schema/entities/pricing_rule.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";
import { vat_rate } from "@/db/schema/entities/vat_rate.js";
import RoomEditor from "../_components/room-editor";

export const dynamic = "force-dynamic";

export default async function AdminRoomEditPage({ params }) {
	const { id } = await params;
	const room = await getRoomById(id);
	if (!room) notFound();

	const [
		blocks,
		layouts,
		images,
		pricingRules,
		bookingTypes,
		vatRates,
		facilityPackages,
		facilityCategories,
		facilityGroups,
		offeredTypes,
	] = await Promise.all([
		listRoomBlocks(room.id),
		listCapacityLayouts(),
		listRoomImages(room.id),
		db
			.select()
			.from(pricing_rule)
			.where(
				and(
					eq(pricing_rule.venue_id, room.venue_id),
					eq(pricing_rule.room_id, room.id),
					isNull(pricing_rule.deletedAt),
				),
			)
			.orderBy(asc(pricing_rule.sort_order), asc(pricing_rule.createdAt)),
		db
			.select()
			.from(booking_type)
			.where(isNull(booking_type.deletedAt))
			.orderBy(asc(booking_type.sort_order), asc(booking_type.label)),
		db
			.select()
			.from(vat_rate)
			.where(isNull(vat_rate.deletedAt)),
		listFacilityPackages(room.id),
		listFacilityCategories(),
		listFacilityPackageGroups(room.id),
		listRoomBookingTypes(room.id),
	]);
	const hero = room.hero_file_id ? await getFileRecord(room.hero_file_id) : null;

	return (
		<RoomEditor
			initialRoom={room}
			initialBlocks={blocks}
			initialHero={hero}
			initialImages={images}
			initialFacilityPackages={facilityPackages}
			initialFacilityGroups={facilityGroups}
			initialOfferedTypeIds={offeredTypes.map((t) => t.booking_type_id)}
			facilityCategories={facilityCategories}
			layouts={layouts}
			pricingRules={pricingRules}
			bookingTypes={bookingTypes}
			vatRates={vatRates}
		/>
	);
}
