/**
 * Recurrence helpers — used for both recurring bookings and recurring
 * blockouts. Supports three pattern kinds:
 *
 *   weekly:           { kind: "weekly", interval: 1, count?: N, until_date?: "YYYY-MM-DD" }
 *   monthly by day:   { kind: "monthly_day", interval: 1, day_of_month: 15, count?: N, until_date?: ... }
 *   monthly by week:  { kind: "monthly_weekday", interval: 1, weekday: 1 (Mon), position: 1|2|3|4|-1, count?, until_date? }
 *
 *   weekday: 0=Sun, 1=Mon, ..., 6=Sat
 *   position: 1=first, 2=second, 3=third, 4=fourth, -1=last
 *
 * Each expander takes a TEMPLATE (the first occurrence — start + end date)
 * and returns the *additional* occurrences. The template itself is NOT
 * included in the returned array.
 *
 * Date arithmetic uses local JS Date; the time-of-day is preserved.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_OCCURRENCES = 156; // ~3 years weekly / 13 years monthly — protects against typos

function toDate(d) {
	const out = d instanceof Date ? d : new Date(d);
	if (Number.isNaN(out.valueOf())) throw new Error(`Invalid date: ${d}`);
	return out;
}

function clampUntil(untilDate) {
	if (!untilDate) return null;
	// Treat the user's `until_date` as inclusive end-of-day.
	const u = new Date(`${untilDate}T23:59:59`);
	if (Number.isNaN(u.valueOf())) throw new Error("Invalid until_date");
	return u;
}

function buildLimit({ count, untilDate }) {
	const until = clampUntil(untilDate);
	if (count) {
		const remaining = Math.max(0, Math.floor(count) - 1);
		let added = 0;
		return ({ candidateStart }) => {
			if (added >= remaining) return false;
			if (until && candidateStart > until) return false;
			added += 1;
			return true;
		};
	}
	if (untilDate) {
		return ({ candidateStart }) => candidateStart <= until;
	}
	throw new Error("Provide count or until_date");
}

export function expandWeeklyPattern({
	templateStart,
	templateEnd,
	interval = 1,
	count = null,
	untilDate = null,
}) {
	const start = toDate(templateStart);
	const end = toDate(templateEnd);
	if (end <= start) throw new Error("Template end must be after start");
	const stepMs = WEEK_MS * Math.max(1, Math.floor(interval));
	const allow = buildLimit({ count, untilDate });
	const occurrences = [];
	let nextStart = new Date(start.getTime() + stepMs);
	let nextEnd = new Date(end.getTime() + stepMs);
	while (occurrences.length < MAX_OCCURRENCES && allow({ candidateStart: nextStart })) {
		occurrences.push({ starts_at: new Date(nextStart), ends_at: new Date(nextEnd) });
		nextStart = new Date(nextStart.getTime() + stepMs);
		nextEnd = new Date(nextEnd.getTime() + stepMs);
	}
	return occurrences;
}

/**
 * Shift a date forward by N months, preserving day-of-month. Returns null
 * if the target month doesn't have that day (e.g. Feb 30 → skip).
 */
function shiftMonthlyByDay(dateRef, monthsForward, dayOfMonth) {
	const out = new Date(dateRef);
	out.setDate(1); // avoid overflow when adjusting the month
	out.setMonth(out.getMonth() + monthsForward);
	const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
	if (dayOfMonth > lastDay) return null;
	out.setDate(dayOfMonth);
	out.setHours(dateRef.getHours(), dateRef.getMinutes(), dateRef.getSeconds(), dateRef.getMilliseconds());
	return out;
}

export function expandMonthlyByDayPattern({
	templateStart,
	templateEnd,
	interval = 1,
	dayOfMonth,
	count = null,
	untilDate = null,
}) {
	const start = toDate(templateStart);
	const end = toDate(templateEnd);
	if (end <= start) throw new Error("Template end must be after start");
	const dom = Number(dayOfMonth ?? start.getDate());
	if (dom < 1 || dom > 31) throw new Error("Invalid day_of_month");
	const step = Math.max(1, Math.floor(interval));
	const allow = buildLimit({ count, untilDate });
	const durationMs = end.getTime() - start.getTime();

	const occurrences = [];
	let monthsAhead = step;
	while (occurrences.length < MAX_OCCURRENCES) {
		const nextStart = shiftMonthlyByDay(start, monthsAhead, dom);
		monthsAhead += step;
		if (!nextStart) continue; // day doesn't exist in this month (e.g. Feb 30)
		if (!allow({ candidateStart: nextStart })) break;
		const nextEnd = new Date(nextStart.getTime() + durationMs);
		occurrences.push({ starts_at: nextStart, ends_at: nextEnd });
		if (monthsAhead > 12 * 30) break;
	}
	return occurrences;
}

/**
 * Find the date in `year`/`monthIndex` that is the Nth weekday-of-month
 * (or last weekday if position=-1). Returns null if it doesn't exist
 * (e.g. asking for the 5th Sunday of a month that doesn't have one).
 */
function nthWeekdayOfMonth(year, monthIndex, weekday, position) {
	if (position === -1) {
		const last = new Date(year, monthIndex + 1, 0); // last day of month
		const diff = (last.getDay() - weekday + 7) % 7;
		return new Date(year, monthIndex, last.getDate() - diff);
	}
	const first = new Date(year, monthIndex, 1);
	const offset = (weekday - first.getDay() + 7) % 7;
	const day = 1 + offset + (position - 1) * 7;
	const lastDay = new Date(year, monthIndex + 1, 0).getDate();
	if (day > lastDay) return null;
	return new Date(year, monthIndex, day);
}

export function expandMonthlyByWeekdayPattern({
	templateStart,
	templateEnd,
	interval = 1,
	weekday,
	position,
	count = null,
	untilDate = null,
}) {
	const start = toDate(templateStart);
	const end = toDate(templateEnd);
	if (end <= start) throw new Error("Template end must be after start");
	const wd = Number(weekday);
	if (wd < 0 || wd > 6) throw new Error("Invalid weekday");
	const pos = Number(position);
	if (![1, 2, 3, 4, -1].includes(pos)) throw new Error("Invalid position");
	const step = Math.max(1, Math.floor(interval));
	const allow = buildLimit({ count, untilDate });
	const durationMs = end.getTime() - start.getTime();

	const occurrences = [];
	let monthsAhead = step;
	while (occurrences.length < MAX_OCCURRENCES) {
		const target = new Date(start.getFullYear(), start.getMonth() + monthsAhead, 1);
		const matchDate = nthWeekdayOfMonth(target.getFullYear(), target.getMonth(), wd, pos);
		monthsAhead += step;
		if (!matchDate) continue;
		const nextStart = new Date(
			matchDate.getFullYear(),
			matchDate.getMonth(),
			matchDate.getDate(),
			start.getHours(),
			start.getMinutes(),
			start.getSeconds(),
			start.getMilliseconds(),
		);
		if (!allow({ candidateStart: nextStart })) break;
		const nextEnd = new Date(nextStart.getTime() + durationMs);
		occurrences.push({ starts_at: nextStart, ends_at: nextEnd });
		if (monthsAhead > 12 * 30) break;
	}
	return occurrences;
}

/**
 * Dispatcher — picks the right expander based on pattern.kind.
 */
export function expandPattern({ templateStart, templateEnd, pattern }) {
	if (!pattern) return [];
	switch (pattern.kind) {
		case "weekly":
			return expandWeeklyPattern({
				templateStart,
				templateEnd,
				interval: pattern.interval,
				count: pattern.count,
				untilDate: pattern.until_date,
			});
		case "monthly_day":
			return expandMonthlyByDayPattern({
				templateStart,
				templateEnd,
				interval: pattern.interval,
				dayOfMonth: pattern.day_of_month,
				count: pattern.count,
				untilDate: pattern.until_date,
			});
		case "monthly_weekday":
			return expandMonthlyByWeekdayPattern({
				templateStart,
				templateEnd,
				interval: pattern.interval,
				weekday: pattern.weekday,
				position: pattern.position,
				count: pattern.count,
				untilDate: pattern.until_date,
			});
		default:
			throw new Error(`Unknown recurrence kind: ${pattern.kind}`);
	}
}

/**
 * Given an arbitrary date, return its weekday position within the month —
 * 1, 2, 3, 4, or -1 (if it's the last of that weekday in the month).
 * Useful for inferring defaults when an admin opens an existing blockout's
 * edit modal: we can suggest "this is the second Tuesday of the month".
 */
export function weekdayPositionInMonth(date) {
	const d = toDate(date);
	const weekday = d.getDay();
	const dayOfMonth = d.getDate();
	const position = Math.ceil(dayOfMonth / 7);
	// Check if this is the LAST occurrence of this weekday in the month.
	const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
	const isLast = dayOfMonth + 7 > lastOfMonth;
	return { weekday, position: isLast ? -1 : position };
}
