import { listCapacityLayouts, listFacilityCategories } from "@/db/queries/rooms";
import { isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";
import RoomEditor from "../_components/room-editor";

export const dynamic = "force-dynamic";

export default async function NewRoomPage() {
	const [layouts, facilityCategories, bookingTypes] = await Promise.all([
		listCapacityLayouts(),
		listFacilityCategories(),
		db.select().from(booking_type).where(isNull(booking_type.deletedAt)),
	]);
	return (
		<RoomEditor
			initialRoom={null}
			initialBlocks={[]}
			initialHero={null}
			initialImages={[]}
			initialFacilityPackages={[]}
			initialOfferedTypeIds={bookingTypes.map((t) => t.id)}
			facilityCategories={facilityCategories}
			layouts={layouts}
			bookingTypes={bookingTypes}
		/>
	);
}
