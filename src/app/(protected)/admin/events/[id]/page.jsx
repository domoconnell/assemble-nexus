import { notFound } from "next/navigation";
import { isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { vat_rate } from "@/db/schema/entities/vat_rate.js";
import {
	getEventById,
	listEventFaqs,
	listTicketTypes,
	listTicketAddonGroups,
	listTicketAddons,
	listTicketTypeAddonLinks,
	listTicketBundles,
	listTicketDiscounts,
	listEventRooms,
} from "@/db/queries/events";
import { listEventOrganisers } from "@/db/queries/organisers";
import { listRoomsForAdmin } from "@/db/queries/rooms";
import { listOrdersForEvent } from "@/db/queries/orders";
import { listExpensesForEvent } from "@/db/queries/finance";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getFileRecord } from "@/utils/files/files.server";
import EventEditor from "../_components/event-editor";

export const dynamic = "force-dynamic";

export default async function AdminEventEditPage({ params }) {
	const { id } = await params;
	const ev = await getEventById(id);
	if (!ev) notFound();

	const venue = await requireCurrentVenue();
	const [
		faqs,
		ticketTypes,
		addonGroups,
		addons,
		typeAddonLinks,
		bundles,
		discounts,
		vatRates,
		organisers,
		eventRoomLinks,
		rooms,
		orders,
	] = await Promise.all([
		listEventFaqs(ev.id),
		listTicketTypes(ev.id),
		listTicketAddonGroups(ev.id),
		listTicketAddons(ev.id),
		listTicketTypeAddonLinks(ev.id),
		listTicketBundles(ev.id),
		listTicketDiscounts(ev.id),
		db.select().from(vat_rate).where(isNull(vat_rate.deletedAt)),
		listEventOrganisers(venue.id),
		listEventRooms(ev.id),
		listRoomsForAdmin(venue.id),
		listOrdersForEvent(ev.id),
	]);
	const linkedExpenses = await listExpensesForEvent(ev.id);
	const banner = ev.banner_file_id ? await getFileRecord(ev.banner_file_id) : null;
	const galleryPhoto = ev.gallery_photo_file_id ? await getFileRecord(ev.gallery_photo_file_id) : null;
	const evWithExtras = { ...ev, gallery_photo_url: galleryPhoto?.public_url ?? null };

	const linksByAddon = new Map();
	for (const l of typeAddonLinks) {
		if (!linksByAddon.has(l.addon_id)) linksByAddon.set(l.addon_id, []);
		linksByAddon.get(l.addon_id).push(l.ticket_type_id);
	}
	const addonsWithLinks = addons.map((a) => ({
		...a,
		ticket_type_ids: linksByAddon.get(a.id) ?? [],
	}));

	return (
		<EventEditor
			initialEvent={evWithExtras}
			initialFaqs={faqs}
			initialTicketTypes={ticketTypes}
			initialAddonGroups={addonGroups}
			initialAddons={addonsWithLinks}
			initialBundles={bundles}
			initialDiscounts={discounts}
			initialBanner={banner}
			initialRoomIds={eventRoomLinks.map((l) => l.room_id)}
			initialOrders={orders}
			initialLinkedExpenses={linkedExpenses}
			rooms={rooms}
			vatRates={vatRates}
			organisers={organisers}
		/>
	);
}
