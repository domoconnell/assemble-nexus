import { isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { vat_rate } from "@/db/schema/entities/vat_rate.js";
import { listEventOrganisers } from "@/db/queries/organisers";
import { listRoomsForAdmin } from "@/db/queries/rooms";
import { requireCurrentVenue } from "@/db/queries/venue";
import EventEditor from "../_components/event-editor";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
	const venue = await requireCurrentVenue();
	const [vatRates, organisers, rooms] = await Promise.all([
		db.select().from(vat_rate).where(isNull(vat_rate.deletedAt)),
		listEventOrganisers(venue.id),
		listRoomsForAdmin(venue.id),
	]);
	return (
		<EventEditor
			initialEvent={null}
			initialFaqs={[]}
			initialTicketTypes={[]}
			initialBanner={null}
			initialRoomIds={[]}
			rooms={rooms}
			vatRates={vatRates}
			organisers={organisers}
		/>
	);
}
