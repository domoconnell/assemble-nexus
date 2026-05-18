import { and, asc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { room_blockout } from "@/db/schema/entities/room_blockout.js";
import { room_blockout_room } from "@/db/schema/entities/room_blockout_room.js";

const WEEKDAY_INDEX = {
	SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Generate the start/end Date pairs a church-event series should
 * materialise into between `from` and `until`, given its recurrence_rule.
 *
 * Supported rules:
 *   { kind: "weekly", by_weekday: ["SU"], time_start: "07:00", time_end: "14:00",
 *     ends_on: null }   - open-ended weekly
 *   { kind: "run", weekday: "TU", time_start: "19:00", time_end: "21:00",
 *     weeks: 6, starts_on: "2026-06-10" }   - finite finite-week run
 */
function generateDates(rule, { from, until }) {
	if (!rule) return [];
	if (rule.kind === "weekly") {
		const targetWeekdays = new Set(
			(rule.by_weekday || []).map((w) => WEEKDAY_INDEX[w]).filter((n) => n !== undefined),
		);
		if (targetWeekdays.size === 0) return [];
		const [sh, sm] = String(rule.time_start || "00:00").split(":").map(Number);
		const [eh, em] = String(rule.time_end || "00:00").split(":").map(Number);
		const endsOn = rule.ends_on ? new Date(`${rule.ends_on}T23:59:59Z`) : null;
		const windowEnd = endsOn && endsOn < until ? endsOn : until;
		const out = [];
		const cursor = new Date(from);
		cursor.setUTCHours(0, 0, 0, 0);
		while (cursor <= windowEnd) {
			if (targetWeekdays.has(cursor.getUTCDay())) {
				const starts = new Date(cursor);
				starts.setUTCHours(sh, sm ?? 0, 0, 0);
				const ends = new Date(cursor);
				ends.setUTCHours(eh, em ?? 0, 0, 0);
				if (starts >= from && starts <= windowEnd) {
					out.push({ starts_at: starts, ends_at: ends });
				}
			}
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
		return out;
	}
	if (rule.kind === "run") {
		const weekday = WEEKDAY_INDEX[rule.weekday];
		if (weekday === undefined) return [];
		const startsOn = new Date(`${rule.starts_on}T00:00:00Z`);
		const [sh, sm] = String(rule.time_start || "00:00").split(":").map(Number);
		const [eh, em] = String(rule.time_end || "00:00").split(":").map(Number);
		const weeks = Math.max(0, Math.min(104, Number(rule.weeks) || 0));
		const out = [];
		// Walk forward from startsOn until we hit the first occurrence on the
		// target weekday, then step weekly for `weeks` iterations.
		const cursor = new Date(startsOn);
		cursor.setUTCHours(0, 0, 0, 0);
		while (cursor.getUTCDay() !== weekday) {
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
		for (let i = 0; i < weeks; i++) {
			const starts = new Date(cursor);
			starts.setUTCHours(sh, sm ?? 0, 0, 0);
			const ends = new Date(cursor);
			ends.setUTCHours(eh, em ?? 0, 0, 0);
			if (starts >= from && starts <= until) {
				out.push({ starts_at: starts, ends_at: ends });
			}
			cursor.setUTCDate(cursor.getUTCDate() + 7);
		}
		return out;
	}
	return [];
}

/**
 * Top-up church-event blockout occurrences out to `until` for every active
 * series at the given venue. Returns inserted-count per series.
 */
export async function materialiseChurchEventsThrough(venueId, until) {
	// Find series definitions (rows that have recurrence_rule set, kind=church).
	const definitions = await db
		.select({
			id: room_blockout.id,
			series_id: room_blockout.series_id,
			reason: room_blockout.reason,
			notes: room_blockout.notes,
			is_public: room_blockout.is_public,
			recurrence_rule: room_blockout.recurrence_rule,
		})
		.from(room_blockout)
		.where(
			and(
				eq(room_blockout.venue_id, venueId),
				eq(room_blockout.kind, "church"),
				isNotNull(room_blockout.recurrence_rule),
				isNotNull(room_blockout.series_id),
				isNull(room_blockout.deletedAt),
			),
		);

	const now = new Date();
	const results = [];

	for (const def of definitions) {
		try {
			// Pull existing occurrences for this series (after now) to dedupe by
			// start time.
			const existing = await db
				.select({
					starts_at: room_blockout.starts_at,
				})
				.from(room_blockout)
				.where(
					and(
						eq(room_blockout.series_id, def.series_id),
						isNull(room_blockout.deletedAt),
						gte(room_blockout.starts_at, now),
					),
				);
			const known = new Set(existing.map((r) => new Date(r.starts_at).toISOString()));
			const want = generateDates(def.recurrence_rule, { from: now, until });
			const fresh = want.filter((s) => !known.has(s.starts_at.toISOString()));
			if (fresh.length === 0) {
				results.push({ series_id: def.series_id, inserted: 0 });
				continue;
			}

			// Replicate the room links from the definition row onto each new
			// occurrence so the multi-room block is preserved.
			const defRooms = await db
				.select({ room_id: room_blockout_room.room_id })
				.from(room_blockout_room)
				.where(eq(room_blockout_room.blockout_id, def.id));

			for (const s of fresh) {
				const [inserted] = await db
					.insert(room_blockout)
					.values({
						venue_id: venueId,
						kind: "church",
						starts_at: s.starts_at,
						ends_at: s.ends_at,
						reason: def.reason,
						notes: def.notes,
						is_public: def.is_public,
						series_id: def.series_id,
						recurrence_rule: null,
					})
					.returning({ id: room_blockout.id });
				if (defRooms.length > 0) {
					await db
						.insert(room_blockout_room)
						.values(defRooms.map((r) => ({ blockout_id: inserted.id, room_id: r.room_id })));
				}
			}
			results.push({ series_id: def.series_id, inserted: fresh.length });
		} catch (err) {
			results.push({ series_id: def.series_id, error: err?.message || String(err) });
		}
	}

	return results;
}
