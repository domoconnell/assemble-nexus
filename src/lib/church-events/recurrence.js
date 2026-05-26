/**
 * Expand a stored recurrence rule into discrete `{ starts_at, ends_at }`
 * occurrence pairs that fall inside a `[from, until)` window. Pure - no
 * DB, no side effects - so it's safe to call from any query layer.
 *
 * Supported rules (the same shape the church-event form writes):
 *   { kind: "weekly", by_weekday: ["SU"], time_start: "07:00",
 *     time_end: "14:00", ends_on: null | "YYYY-MM-DD" }
 *   { kind: "run", weekday: "TU", time_start: "19:00", time_end: "21:00",
 *     weeks: 6, starts_on: "YYYY-MM-DD" }
 *
 * Returning Date objects (not strings) so callers can do native time
 * comparisons against window bounds.
 */

const WEEKDAY_INDEX = {
	SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

export function expandRecurrence(rule, { from, until }) {
	if (!rule) return [];
	if (rule.kind === "weekly") return expandWeekly(rule, { from, until });
	if (rule.kind === "run") return expandRun(rule, { from, until });
	return [];
}

function expandWeekly(rule, { from, until }) {
	const targetWeekdays = new Set(
		(rule.by_weekday || []).map((w) => WEEKDAY_INDEX[w]).filter((n) => n !== undefined),
	);
	if (targetWeekdays.size === 0) return [];
	const [sh, sm] = String(rule.time_start || "00:00").split(":").map(Number);
	const [eh, em] = String(rule.time_end || "00:00").split(":").map(Number);

	// Honour the rule's optional ends_on, plus its starts_on (don't emit
	// before the series begins, even if the requested window stretches
	// further back).
	const startsOn = rule.starts_on ? new Date(`${rule.starts_on}T00:00:00Z`) : null;
	const endsOn = rule.ends_on ? new Date(`${rule.ends_on}T23:59:59Z`) : null;
	const lower = startsOn && startsOn > from ? startsOn : from;
	const upper = endsOn && endsOn < until ? endsOn : until;

	const out = [];
	const cursor = new Date(lower);
	cursor.setUTCHours(0, 0, 0, 0);
	while (cursor <= upper) {
		if (targetWeekdays.has(cursor.getUTCDay())) {
			const starts = new Date(cursor);
			starts.setUTCHours(sh, sm ?? 0, 0, 0);
			const ends = new Date(cursor);
			ends.setUTCHours(eh, em ?? 0, 0, 0);
			if (starts >= lower && starts <= upper) {
				out.push({ starts_at: starts, ends_at: ends });
			}
		}
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return out;
}

function expandRun(rule, { from, until }) {
	const weekday = WEEKDAY_INDEX[rule.weekday];
	if (weekday === undefined) return [];
	const startsOn = new Date(`${rule.starts_on}T00:00:00Z`);
	const [sh, sm] = String(rule.time_start || "00:00").split(":").map(Number);
	const [eh, em] = String(rule.time_end || "00:00").split(":").map(Number);
	const weeks = Math.max(0, Math.min(104, Number(rule.weeks) || 0));
	const out = [];
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
