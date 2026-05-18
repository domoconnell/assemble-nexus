/**
 * Pure (no IO) schedule helpers for tenancies. Extracted from
 * `materialiser.js` so unit tests can import them without booting the
 * DB client.
 */

const WEEKDAY_INDEX = {
	SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

/**
 * Build the set of session start/end Date pairs that should exist for a
 * scheduled_recurring tenancy between `from` and `until`, given its
 * schedule_rule.
 *
 * Schedule rule shape:
 *   {
 *     by_weekday: ["WE", "TH"],
 *     time_start: "09:00",
 *     time_end:   "13:00",
 *   }
 */
export function generateSessionDates(tenancy, { from, until }) {
	const rule = tenancy.schedule_rule;
	if (!rule?.by_weekday?.length) return [];
	const targetWeekdays = new Set(
		rule.by_weekday.map((w) => WEEKDAY_INDEX[w]).filter((n) => n !== undefined),
	);
	if (targetWeekdays.size === 0) return [];

	const [startH, startM] = String(rule.time_start || "00:00").split(":").map(Number);
	const [endH, endM] = String(rule.time_end || "00:00").split(":").map(Number);
	if (!Number.isFinite(startH) || !Number.isFinite(endH)) return [];

	const tenancyStart = new Date(`${tenancy.starts_on}T00:00:00Z`);
	const tenancyEnd = tenancy.ends_on
		? new Date(`${tenancy.ends_on}T23:59:59Z`)
		: null;
	const windowStart = from > tenancyStart ? from : tenancyStart;
	const windowEnd = tenancyEnd && tenancyEnd < until ? tenancyEnd : until;
	if (windowEnd <= windowStart) return [];

	const out = [];
	const cursor = new Date(windowStart);
	cursor.setUTCHours(0, 0, 0, 0);
	while (cursor <= windowEnd) {
		if (targetWeekdays.has(cursor.getUTCDay())) {
			const starts = new Date(cursor);
			starts.setUTCHours(startH, startM ?? 0, 0, 0);
			const ends = new Date(cursor);
			ends.setUTCHours(endH, endM ?? 0, 0, 0);
			if (starts >= windowStart && starts <= windowEnd) {
				out.push({ starts_at: starts, ends_at: ends });
			}
		}
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return out;
}
