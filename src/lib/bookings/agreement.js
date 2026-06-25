import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { booking_agreement } from "@/db/schema/entities/booking_agreement.js";

/**
 * Return the venue's currently-active booking agreement as a
 * lightweight snapshot shape: `{ title, intro, version, sections }`.
 * Null when no active agreement exists — callers should skip the
 * agreement-attach / acceptance flow in that case.
 *
 * The snapshot is what gets persisted on the booking at approval
 * time, so the customer always sees / signs the wording that was
 * live when their booking was approved, even if the master copy
 * later changes.
 */
export async function getActiveBookingAgreementSnapshot(venueId) {
	if (!venueId) return null;
	const [row] = await db
		.select()
		.from(booking_agreement)
		.where(
			and(
				eq(booking_agreement.venue_id, venueId),
				eq(booking_agreement.is_active, true),
				isNull(booking_agreement.deletedAt),
			),
		)
		.orderBy(desc(booking_agreement.createdAt))
		.limit(1);
	if (!row) return null;
	return {
		title: row.title ?? "Booking Agreement",
		intro: row.intro ?? null,
		version: row.version ?? null,
		sections: Array.isArray(row.sections) ? row.sections : [],
	};
}
