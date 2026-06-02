/**
 * Pure (no IO) schedule helpers for tenancies. Extracted from
 * `materialiser.js` so unit tests can import them without booting the
 * DB client.
 *
 * A tenancy's `schedule_rule` is an array of `Rule` objects. The
 * materialiser unions all rules' occurrences, snapshots each session
 * with its source rule's id and per-session rate, and dedupes on
 * (starts_at, ends_at).
 *
 * Supported rule kinds:
 *
 *   weekly       Every `interval` weeks on every weekday in `by_weekday`.
 *                Example: { kind: "weekly", by_weekday: ["MO","TH"],
 *                  interval: 1, time_start: "09:00", time_end: "11:00",
 *                  per_session_rate_cents: 2000 }
 *
 *   monthly_nth  Every `interval` months, on the Nth occurrence of each
 *                weekday in `by_weekday` (per `by_set_pos`; -1 = last).
 *                Example (1st & 3rd & last Mondays):
 *                  { kind: "monthly_nth", by_weekday: ["MO"],
 *                    by_set_pos: [1,3,-1], interval: 1,
 *                    time_start: "09:00", time_end: "11:00",
 *                    per_session_rate_cents: 2000 }
 *
 * Adding new kinds: implement `expandX(rule, window)` returning
 * `{ starts_at, ends_at }[]` and add the dispatch line in `expandRule`.
 */

const WEEKDAY_INDEX = {
	SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

export const SCHEDULE_RULE_KINDS = ["weekly", "monthly_nth"];

function parseHm(s) {
	const [h, m] = String(s || "00:00").split(":").map(Number);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
	return { h, m };
}

/**
 * Offset (in ms) of Europe/London at the given moment. Positive in BST
 * (summer = UTC+1), zero in GMT. Uses Intl so we don't bring in a TZ
 * library just to handle DST.
 */
function londonOffsetMs(at) {
	const parts = new Intl.DateTimeFormat("en", {
		timeZone: "Europe/London",
		timeZoneName: "longOffset",
	}).formatToParts(at);
	const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
	const m = offsetPart.match(/GMT([+-])(\d{2}):(\d{2})/);
	if (!m) return 0;
	const sign = m[1] === "+" ? 1 : -1;
	const hours = parseInt(m[2], 10);
	const minutes = parseInt(m[3], 10);
	return sign * (hours * 60 + minutes) * 60 * 1000;
}

/**
 * Build a UTC `Date` whose wall-clock representation in Europe/London is
 * the supplied year/month/day/hour/minute. DST-safe — we look up the
 * London offset at the candidate moment and back-correct. Used so admins
 * who type "08:45" on the schedule editor see "08:45" on the calendar
 * regardless of whether the session falls in BST or GMT.
 */
function setTime(date, hm) {
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const day = date.getUTCDate();
	const guess = Date.UTC(year, month, day, hm.h, hm.m, 0);
	const offset = londonOffsetMs(new Date(guess));
	return new Date(guess - offset);
}

function startOfUtcDay(date) {
	const out = new Date(date);
	out.setUTCHours(0, 0, 0, 0);
	return out;
}

/**
 * Coerce the legacy single-object shape to the new array shape on read,
 * so older rows materialise correctly until they get backfilled. Always
 * returns a fresh array; never mutates the input.
 */
export function normaliseSchedule(raw) {
	if (Array.isArray(raw)) return raw;
	if (raw && typeof raw === "object" && raw.by_weekday) {
		return [{
			id: raw.id ?? null,
			kind: "weekly",
			by_weekday: raw.by_weekday,
			interval: 1,
			time_start: raw.time_start,
			time_end: raw.time_end,
			per_session_rate_cents: raw.per_session_rate_cents ?? null,
		}];
	}
	return [];
}

/* ------------------------------------------------------------------ */
/* Per-kind expanders                                                  */
/* ------------------------------------------------------------------ */

function expandWeekly(rule, { from, until }) {
	const start = parseHm(rule.time_start);
	const end = parseHm(rule.time_end);
	if (!start || !end) return [];
	const targets = new Set(
		(rule.by_weekday || []).map((w) => WEEKDAY_INDEX[w]).filter((n) => n !== undefined),
	);
	if (targets.size === 0) return [];
	const interval = Math.max(1, Number(rule.interval) || 1);

	const out = [];
	const cursor = startOfUtcDay(from);
	const fromMs = from.getTime();
	const untilMs = until.getTime();
	// Reference Monday for week-index calculation when interval > 1. We
	// just need a stable epoch so "every 2 weeks" picks the same parity.
	const EPOCH_MONDAY_MS = Date.UTC(2024, 0, 1); // 2024-01-01 was a Monday.
	while (cursor.getTime() <= untilMs) {
		if (targets.has(cursor.getUTCDay())) {
			const weekIdx = Math.floor((cursor.getTime() - EPOCH_MONDAY_MS) / (7 * 24 * 60 * 60 * 1000));
			if (((weekIdx % interval) + interval) % interval === 0) {
				const startsAt = setTime(cursor, start);
				const endsAt = setTime(cursor, end);
				if (startsAt.getTime() >= fromMs && startsAt.getTime() <= untilMs) {
					out.push({ starts_at: startsAt, ends_at: endsAt });
				}
			}
		}
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return out;
}

function expandMonthlyNth(rule, { from, until }) {
	const start = parseHm(rule.time_start);
	const end = parseHm(rule.time_end);
	if (!start || !end) return [];
	const weekdays = new Set(
		(rule.by_weekday || []).map((w) => WEEKDAY_INDEX[w]).filter((n) => n !== undefined),
	);
	if (weekdays.size === 0) return [];
	const positions = (rule.by_set_pos || []).filter((n) => Number.isInteger(n) && n !== 0);
	if (positions.length === 0) return [];
	const interval = Math.max(1, Number(rule.interval) || 1);

	const fromMs = from.getTime();
	const untilMs = until.getTime();

	const fromY = from.getUTCFullYear();
	const fromMonth = from.getUTCMonth();
	const untilY = until.getUTCFullYear();
	const untilMonth = until.getUTCMonth();

	const out = [];
	// Stable epoch month for interval parity ("every 2 months" stays
	// aligned across runs). Jan 2024 = month index 0.
	const EPOCH_MONTH = 2024 * 12;

	for (let y = fromY; y <= untilY; y++) {
		const mStart = y === fromY ? fromMonth : 0;
		const mEnd = y === untilY ? untilMonth : 11;
		for (let m = mStart; m <= mEnd; m++) {
			const monthIdx = y * 12 + m;
			if (((monthIdx - EPOCH_MONTH) % interval + interval) % interval !== 0) continue;

			// Collect every weekday-of-interest in this month, in calendar order.
			const occurrencesByWeekday = new Map();
			const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
			for (let d = 1; d <= daysInMonth; d++) {
				const day = new Date(Date.UTC(y, m, d));
				const wd = day.getUTCDay();
				if (!weekdays.has(wd)) continue;
				const arr = occurrencesByWeekday.get(wd) ?? [];
				arr.push(day);
				occurrencesByWeekday.set(wd, arr);
			}

			for (const [, days] of occurrencesByWeekday) {
				for (const pos of positions) {
					const idx = pos > 0 ? pos - 1 : days.length + pos;
					if (idx < 0 || idx >= days.length) continue;
					const day = days[idx];
					const startsAt = setTime(day, start);
					const endsAt = setTime(day, end);
					if (startsAt.getTime() >= fromMs && startsAt.getTime() <= untilMs) {
						out.push({ starts_at: startsAt, ends_at: endsAt });
					}
				}
			}
		}
	}
	return out;
}

function expandRule(rule, window) {
	if (rule.kind === "weekly") return expandWeekly(rule, window);
	if (rule.kind === "monthly_nth") return expandMonthlyNth(rule, window);
	return [];
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build every session occurrence for a single scheduled tenancy_line
 * between `from` and `until`, clipped to the tenancy's overall start/end.
 *
 * Returns: [{ rule_id, rate_cents, starts_at: Date, ends_at: Date }]
 * `rate_cents` is the per-session-rate snapshot when billing_mode is
 * `per_session`, otherwise null (per-hour and fixed-monthly compute
 * amounts at invoice time, not per session).
 *
 * De-duped on (starts_at, ends_at) within the same line. Earlier rule in
 * the array wins on collision.
 */
export function generateSessionDates(line, tenancyDates, { from, until }) {
	if (!line || line.kind !== "scheduled") return [];
	const rules = normaliseSchedule(line.schedule_rule);
	if (rules.length === 0) return [];

	const tenancyStart = new Date(`${tenancyDates.starts_on}T00:00:00Z`);
	const tenancyEnd = tenancyDates.ends_on
		? new Date(`${tenancyDates.ends_on}T23:59:59Z`)
		: null;
	const windowStart = from > tenancyStart ? from : tenancyStart;
	const windowEnd = tenancyEnd && tenancyEnd < until ? tenancyEnd : until;
	if (windowEnd <= windowStart) return [];

	const seen = new Set();
	const out = [];
	for (const rule of rules) {
		const dates = expandRule(rule, { from: windowStart, until: windowEnd });
		for (const occ of dates) {
			const key = `${occ.starts_at.getTime()}|${occ.ends_at.getTime()}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({
				rule_id: rule.id ?? null,
				rate_cents:
					line.billing_mode === "per_session"
						? line.per_session_rate_cents ?? null
						: null,
				starts_at: occ.starts_at,
				ends_at: occ.ends_at,
			});
		}
	}
	out.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
	return out;
}

/**
 * Human-readable summary of a rule for the admin UI. Returns a short
 * label like "Mon, Thu 9:00-11:00" or "1st & 3rd Mon 9:00-11:00".
 */
export function describeRule(rule) {
	if (!rule) return "";
	const days = (rule.by_weekday || []).join(", ");
	const time = `${rule.time_start}-${rule.time_end}`;
	if (rule.kind === "weekly") {
		const every = rule.interval > 1 ? ` every ${rule.interval} wks` : "";
		return `${days} ${time}${every}`.trim();
	}
	if (rule.kind === "monthly_nth") {
		const ordinals = (rule.by_set_pos || []).map((n) => {
			if (n === -1) return "Last";
			if (n === 1) return "1st";
			if (n === 2) return "2nd";
			if (n === 3) return "3rd";
			return `${n}th`;
		}).join(" & ");
		const every = rule.interval > 1 ? ` every ${rule.interval} mo` : "";
		return `${ordinals} ${days} ${time}${every}`.trim();
	}
	return `${days} ${time}`;
}
