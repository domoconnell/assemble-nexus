import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { room } from "@/db/schema/entities/room.js";
import { pricing_rule } from "@/db/schema/entities/pricing_rule.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";

/**
 * The "rack" (headline) hourly rate for every public room in a venue.
 *
 * We define rack rate as the room's hourly pricing_rule for a booking_type
 * that carries the full rate modifier (default_rate_modifier_x100 = 10000).
 * Setup / teardown / rehearsal modifiers are discounts off this headline,
 * not the rack itself.
 *
 * Returns a plain object keyed by room_id → amount_cents. Rooms with no
 * matching pricing_rule are simply omitted.
 */
export async function listRoomRackHourlyRates(venueId) {
	const rows = await db
		.select({
			room_id: pricing_rule.room_id,
			amount_cents: pricing_rule.amount_cents,
		})
		.from(pricing_rule)
		.innerJoin(booking_type, eq(booking_type.id, pricing_rule.booking_type_id))
		.innerJoin(room, eq(room.id, pricing_rule.room_id))
		.where(
			and(
				eq(pricing_rule.venue_id, venueId),
				eq(pricing_rule.rate_kind, "hourly"),
				eq(booking_type.default_rate_modifier_x100, 10000),
				isNull(pricing_rule.deletedAt),
				isNull(booking_type.deletedAt),
				isNull(room.deletedAt),
			),
		);
	const out = {};
	for (const r of rows) {
		if (r.room_id == null) continue;
		// In case the venue has more than one full-rate booking_type for
		// a room, keep the highest figure — the "rack rate" by definition.
		if (out[r.room_id] == null || r.amount_cents > out[r.room_id]) {
			out[r.room_id] = r.amount_cents;
		}
	}
	return out;
}
