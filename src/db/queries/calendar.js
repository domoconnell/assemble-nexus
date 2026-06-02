import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { room } from "@/db/schema/entities/room.js";
import { booking } from "@/db/schema/entities/booking.js";
import { booking_segment } from "@/db/schema/entities/booking_segment.js";
import { tenancy, tenancy_line, tenancy_session } from "@/db/schema/entities/tenancy.js";
import { room_blockout } from "@/db/schema/entities/room_blockout.js";
import { room_blockout_room } from "@/db/schema/entities/room_blockout_room.js";
import { event } from "@/db/schema/entities/event.js";
import { event_room } from "@/db/schema/entities/event_room.js";
import { expandRecurrence } from "@/lib/church-events/recurrence.js";

/**
 * Slim list of public rooms used by the calendar room-filter chips. Names
 * + ids only, ordered the same way the public site renders rooms.
 */
export async function listPublicRoomsForCalendar(venueId) {
	return db
		.select({
			id: room.id,
			name: room.name,
			slug: room.slug,
			sort_order: room.sort_order,
		})
		.from(room)
		.where(
			and(
				eq(room.venue_id, venueId),
				eq(room.is_published, true),
				eq(room.is_public, true),
				isNull(room.deletedAt),
			),
		)
		.orderBy(asc(room.sort_order), asc(room.name));
}

/**
 * Unified "what's happening on the public rooms" feed for a date window.
 * Pulls four sources and normalises them onto one shape:
 *
 *   { id, kind, room_id, room_name, starts_at, ends_at, title, subtitle }
 *
 *   kind:
 *     - "external"  : booking_segment, a one-off external hire
 *     - "external"  : tenancy_session, a recurring tenant's slot
 *     - "church"    : room_blockout where kind = 'church'
 *     - "closure"   : room_blockout where kind = 'venue' AND is_public
 *     - "event"     : published, public event with a room picked
 *
 * Always filtered to public rooms only - private rooms never leak here.
 * Pass `roomIds` to narrow further to a user-selected set.
 */
export async function listPublicCalendarItemsInRange(venueId, start, end, { roomIds } = {}) {
	const startIso = start.toISOString();
	const endIso = end.toISOString();
	const roomFilter = Array.isArray(roomIds) && roomIds.length > 0 ? roomIds : null;

	const publicRoomCondition = and(
		eq(room.is_published, true),
		eq(room.is_public, true),
		isNull(room.deletedAt),
		roomFilter ? inArray(room.id, roomFilter) : sql`true`,
	);

	const overlap = (startCol, endCol) =>
		and(lt(startCol, end), gt(endCol, start));

	const [
		externalHires,
		tenancySessions,
		churchAdhoc,
		churchDefinitions,
		closureBlockouts,
		publishedEvents,
	] = await Promise.all([
			// External one-off bookings
			db
				.select({
					id: booking_segment.id,
					starts_at: booking_segment.starts_at,
					ends_at: booking_segment.ends_at,
					booking_status: booking.status,
					room_id: room.id,
					room_name: room.name,
				})
				.from(booking_segment)
				.innerJoin(booking, eq(booking_segment.booking_id, booking.id))
				.innerJoin(room, eq(booking_segment.room_id, room.id))
				.where(
					and(
						eq(booking.venue_id, venueId),
						isNull(booking.deletedAt),
						notInArray(booking.status, ["rejected", "cancelled"]),
						publicRoomCondition,
						overlap(booking_segment.starts_at, booking_segment.ends_at),
					),
				)
				.orderBy(asc(booking_segment.starts_at)),

			// Recurring tenant sessions
			db
				.select({
					id: tenancy_session.id,
					starts_at: tenancy_session.starts_at,
					ends_at: tenancy_session.ends_at,
					room_id: room.id,
					room_name: room.name,
				})
				.from(tenancy_session)
				.innerJoin(tenancy, eq(tenancy_session.tenancy_id, tenancy.id))
				.innerJoin(tenancy_line, eq(tenancy_session.tenancy_line_id, tenancy_line.id))
				.innerJoin(room, eq(tenancy_line.room_id, room.id))
				.where(
					and(
						eq(tenancy.venue_id, venueId),
						isNull(tenancy.deletedAt),
						isNull(tenancy_session.deletedAt),
						eq(tenancy_session.status, "scheduled"),
						publicRoomCondition,
						overlap(tenancy_session.starts_at, tenancy_session.ends_at),
					),
				)
				.orderBy(asc(tenancy_session.starts_at)),

			// Church-use blockouts: adhoc one-offs (no series + no rule).
			// Definition rows for weekly / run series are handled by a
			// separate query below that expands the rule at query time.
			db
				.select({
					id: room_blockout.id,
					starts_at: room_blockout.starts_at,
					ends_at: room_blockout.ends_at,
					reason: room_blockout.reason,
					room_id: room.id,
					room_name: room.name,
				})
				.from(room_blockout)
				.innerJoin(room_blockout_room, eq(room_blockout_room.blockout_id, room_blockout.id))
				.innerJoin(room, eq(room.id, room_blockout_room.room_id))
				.where(
					and(
						eq(room_blockout.venue_id, venueId),
						eq(room_blockout.kind, "church"),
						isNull(room_blockout.series_id),
						isNull(room_blockout.recurrence_rule),
						isNull(room_blockout.deletedAt),
						publicRoomCondition,
						overlap(room_blockout.starts_at, room_blockout.ends_at),
					),
				)
				.orderBy(asc(room_blockout.starts_at)),

			// Church-use series definitions. We load the rule + linked
			// rooms once and expand into occurrences in JS within the
			// window. No materialised rows, no cron.
			db
				.select({
					id: room_blockout.id,
					reason: room_blockout.reason,
					recurrence_rule: room_blockout.recurrence_rule,
					room_id: room.id,
					room_name: room.name,
				})
				.from(room_blockout)
				.innerJoin(room_blockout_room, eq(room_blockout_room.blockout_id, room_blockout.id))
				.innerJoin(room, eq(room.id, room_blockout_room.room_id))
				.where(
					and(
						eq(room_blockout.venue_id, venueId),
						eq(room_blockout.kind, "church"),
						isNotNull(room_blockout.recurrence_rule),
						isNull(room_blockout.deletedAt),
						publicRoomCondition,
					),
				),

			// Plain venue closures (maintenance / private holds). Only
			// surface those the admin explicitly marked public.
			db
				.select({
					id: room_blockout.id,
					starts_at: room_blockout.starts_at,
					ends_at: room_blockout.ends_at,
					reason: room_blockout.reason,
					room_id: room.id,
					room_name: room.name,
				})
				.from(room_blockout)
				.innerJoin(room_blockout_room, eq(room_blockout_room.blockout_id, room_blockout.id))
				.innerJoin(room, eq(room.id, room_blockout_room.room_id))
				.where(
					and(
						eq(room_blockout.venue_id, venueId),
						eq(room_blockout.kind, "venue"),
						eq(room_blockout.is_public, true),
						isNull(room_blockout.deletedAt),
						publicRoomCondition,
						overlap(room_blockout.starts_at, room_blockout.ends_at),
					),
				)
				.orderBy(asc(room_blockout.starts_at)),

			// Published public events. Events may pick multiple rooms via
			// event_room; we emit one calendar item per room.
			db
				.select({
					id: event.id,
					title: event.title,
					slug: event.slug,
					starts_at: event.starts_at,
					ends_at: event.ends_at,
					room_id: room.id,
					room_name: room.name,
				})
				.from(event)
				.innerJoin(event_room, eq(event_room.event_id, event.id))
				.innerJoin(room, eq(room.id, event_room.room_id))
				.where(
					and(
						eq(event.venue_id, venueId),
						eq(event.visibility, "public"),
						eq(event.status, "published"),
						isNull(event.deletedAt),
						sql`${event.starts_at} is not null`,
						sql`${event.ends_at} is not null`,
						publicRoomCondition,
						overlap(event.starts_at, event.ends_at),
					),
				)
				.orderBy(asc(event.starts_at)),
		]);

	const items = [];

	// Helper: collapse rows that share an entity id into one item with a
	// `rooms` array. Used for the multi-room sources (blockouts, events)
	// so e.g. a Sunday-morning church block across three rooms shows as
	// one pill listing all three.
	function groupByEntity(rows, idKey, build) {
		const byId = new Map();
		for (const r of rows) {
			const key = r[idKey];
			const cur = byId.get(key);
			if (cur) {
				cur.rooms.push({ room_id: r.room_id, room_name: r.room_name });
			} else {
				byId.set(key, {
					...build(r),
					rooms: [{ room_id: r.room_id, room_name: r.room_name }],
				});
			}
		}
		return [...byId.values()];
	}

	// Bookings + tenancy sessions are intrinsically per-room (one segment
	// = one room), so they ship as single-entry rooms arrays for shape
	// consistency.
	for (const r of externalHires) {
		// A booking is "firm" only once the deposit is in (status flips to
		// confirmed) or the booking is already completed. Pending and
		// approved bookings still have a chance of falling through, so we
		// flag them tentative for the UI to render hashed.
		const tentative = r.booking_status !== "confirmed" && r.booking_status !== "completed";
		items.push({
			id: `bk_${r.id}`,
			kind: "external",
			source: "booking",
			rooms: [{ room_id: r.room_id, room_name: r.room_name }],
			starts_at: r.starts_at,
			ends_at: r.ends_at,
			title: tentative ? "External booking (pending)" : "External booking",
			tentative,
		});
	}
	for (const r of tenancySessions) {
		items.push({
			id: `ts_${r.id}`,
			kind: "external",
			source: "tenancy",
			rooms: [{ room_id: r.room_id, room_name: r.room_name }],
			starts_at: r.starts_at,
			ends_at: r.ends_at,
			title: "External booking",
		});
	}

	// Church + closure adhoc blockouts and published events can each
	// touch multiple rooms; collapse so a Sunday block over three rooms
	// renders as one chip listing the three.
	items.push(
		...groupByEntity(churchAdhoc, "id", (r) => ({
			id: `ch_${r.id}`,
			kind: "church",
			source: "church",
			starts_at: r.starts_at,
			ends_at: r.ends_at,
			title: "Church booking",
			reason: r.reason,
		})),
	);

	// Group recurring definitions by blockout id so we expand once per
	// series, then emit one item per occurrence listing every room.
	const seriesById = new Map();
	for (const r of churchDefinitions) {
		const cur = seriesById.get(r.id) ?? {
			id: r.id,
			reason: r.reason,
			recurrence_rule: r.recurrence_rule,
			rooms: [],
		};
		cur.rooms.push({ room_id: r.room_id, room_name: r.room_name });
		seriesById.set(r.id, cur);
	}
	for (const series of seriesById.values()) {
		const occurrences = expandRecurrence(series.recurrence_rule, { from: start, until: end });
		for (const occ of occurrences) {
			items.push({
				id: `ch_${series.id}_${occ.starts_at.toISOString()}`,
				kind: "church",
				source: "church",
				rooms: series.rooms,
				starts_at: occ.starts_at,
				ends_at: occ.ends_at,
				title: "Church booking",
				reason: series.reason,
			});
		}
	}

	items.push(
		...groupByEntity(closureBlockouts, "id", (r) => ({
			id: `cl_${r.id}`,
			kind: "closure",
			source: "closure",
			starts_at: r.starts_at,
			ends_at: r.ends_at,
			title: r.reason || "Unavailable",
		})),
	);

	items.push(
		...groupByEntity(publishedEvents, "id", (r) => ({
			id: `ev_${r.id}`,
			kind: "event",
			source: "event",
			starts_at: r.starts_at,
			ends_at: r.ends_at,
			title: r.title,
			href: r.slug ? `/events/${r.slug}` : null,
		})),
	);

	items.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
	return items;
}
