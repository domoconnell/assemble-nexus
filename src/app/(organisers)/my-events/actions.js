"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/index.js";
import { event } from "@/db/schema/entities/event.js";
import { booking } from "@/db/schema/entities/booking.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { userCanEditEvent } from "@/db/queries/events.js";
import { saveEventAction } from "@/app/(protected)/admin/events/actions.js";

/**
 * Hirer-side wrapper around saveEventAction. Strips fields hirers aren't allowed
 * to set (status / visibility / event_organiser_id) so they always come from the
 * existing row.
 */
export async function saveEventForHirerAction(input) {
	const session = await requireServerSession({ redirectTo: "/auth/login" });
	if (!input?.id) throw new Error("Cannot create events from the hirer portal yet.");

	const canEdit = await userCanEditEvent(session.user.id, input.id);
	if (!canEdit) throw new Error("Not authorised");

	const [existing] = await db.select().from(event).where(eq(event.id, input.id)).limit(1);
	if (!existing) throw new Error("Event not found");

	const safe = {
		...input,
		event_organiser_id: existing.event_organiser_id,
		status: existing.status === "published" ? "published" : existing.status,
		visibility: existing.visibility,
	};
	return saveEventAction(safe);
}

const SubmitForReviewSchema = z.object({
	event_id: z.string().uuid(),
});

export async function submitEventForReviewAction(input) {
	const session = await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = SubmitForReviewSchema.parse(input);

	const canEdit = await userCanEditEvent(session.user.id, parsed.event_id);
	if (!canEdit) throw new Error("Not authorised");

	const [ev] = await db.select().from(event).where(eq(event.id, parsed.event_id)).limit(1);
	if (!ev) throw new Error("Event not found");
	if (ev.status === "published") return ev;

	// Block submit-for-review until the booking is confirmed (deposit paid).
	// Events without a booking are admin-managed and skip this gate.
	if (ev.booking_id) {
		const [b] = await db
			.select({ status: booking.status })
			.from(booking)
			.where(eq(booking.id, ev.booking_id))
			.limit(1);
		if (!b || (b.status !== "confirmed" && b.status !== "completed")) {
			throw new Error(
				"This event can be submitted for approval once the booking is confirmed (deposit paid).",
			);
		}
	}

	const [updated] = await db
		.update(event)
		.set({ status: "pending_review" })
		.where(eq(event.id, ev.id))
		.returning();

	revalidatePath(`/my-events`);
	revalidatePath(`/my-events/${ev.id}`);
	revalidatePath(`/my-events/${ev.id}/edit`);
	revalidatePath(`/admin/events`);
	revalidatePath(`/admin/events/${ev.id}`);
	return updated;
}
