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
	userCanEditEvent,
} from "@/db/queries/events";
import { getFileRecord } from "@/utils/files/files.server";
import { requireServerSession } from "@/utils/auth/server-guard";
import EventEditor from "@/app/(protected)/admin/events/_components/event-editor";
import { saveEventForHirerAction, submitEventForReviewAction } from "../../actions";

export const dynamic = "force-dynamic";

async function submitForReview(eventId) {
	"use server";
	await submitEventForReviewAction({ event_id: eventId });
}

export default async function HirerEventEditPage({ params }) {
	const { id } = await params;
	const session = await requireServerSession({
		redirectTo: `/auth/login?callbackURL=/my-events/${id}/edit`,
	});

	const ev = await getEventById(id);
	if (!ev) notFound();

	const canEdit = await userCanEditEvent(session.user.id, ev.id);
	if (!canEdit) notFound();

	const [
		faqs,
		ticketTypes,
		addonGroups,
		addons,
		typeAddonLinks,
		bundles,
		discounts,
		vatRates,
	] = await Promise.all([
		listEventFaqs(ev.id),
		listTicketTypes(ev.id),
		listTicketAddonGroups(ev.id),
		listTicketAddons(ev.id),
		listTicketTypeAddonLinks(ev.id),
		listTicketBundles(ev.id),
		listTicketDiscounts(ev.id),
		db.select().from(vat_rate).where(isNull(vat_rate.deletedAt)),
	]);
	const banner = ev.banner_file_id ? await getFileRecord(ev.banner_file_id) : null;

	const linksByAddon = new Map();
	for (const l of typeAddonLinks) {
		if (!linksByAddon.has(l.addon_id)) linksByAddon.set(l.addon_id, []);
		linksByAddon.get(l.addon_id).push(l.ticket_type_id);
	}
	const addonsWithLinks = addons.map((a) => ({
		...a,
		ticket_type_ids: linksByAddon.get(a.id) ?? [],
	}));

	const submitBound = submitForReview.bind(null, ev.id);

	return (
		<EventEditor
			initialEvent={ev}
			initialFaqs={faqs}
			initialTicketTypes={ticketTypes}
			initialAddonGroups={addonGroups}
			initialAddons={addonsWithLinks}
			initialBundles={bundles}
			initialDiscounts={discounts}
			initialBanner={banner}
			vatRates={vatRates}
			organisers={[]}
			surface="hirer"
			onSaveBasics={saveEventForHirerAction}
			onSubmitForReview={submitBound}
			backHref="/my-events"
			backLabel="← Your events"
		/>
	);
}
