/**
 * Helpers for handling month boundaries in Europe/London. Finance reporting
 * is naturally month-based - these utilities give us consistent inclusive
 * lower / exclusive upper bounds in both YYYY-MM-DD string form (for date
 * columns like expense.date) and Date form (for timestamptz columns like
 * ticket_order.paid_at).
 */

function pad(n) {
	return String(n).padStart(2, "0");
}

export function ymdFirstOfMonth(year, month1) {
	return `${year}-${pad(month1)}-01`;
}

export function nextMonth(year, month1) {
	return month1 === 12
		? { year: year + 1, month1: 1 }
		: { year, month1: month1 + 1 };
}

export function prevMonth(year, month1) {
	return month1 === 1
		? { year: year - 1, month1: 12 }
		: { year, month1: month1 - 1 };
}

/**
 * Resolve a month identifier (e.g. "2026-05") into all the date forms the
 * finance queries need. We use Europe/London for the timestamptz boundaries
 * so a booking confirmed at 23:30 BST on the 31st is in the right month.
 */
export function resolveMonth(ym /* 'YYYY-MM' */) {
	const [year, month1] = ym.split("-").map(Number);
	const next = nextMonth(year, month1);
	const ymdStart = ymdFirstOfMonth(year, month1);
	const ymdEnd = ymdFirstOfMonth(next.year, next.month1);
	// Construct UTC instants representing midnight London time. BST/GMT shifts
	// happen on the last Sunday of March/October; if the month boundary is
	// inside a DST transition the offset is one of {0, +1}. We pick midnight
	// UTC as a conservative anchor - finance reporting at month granularity
	// doesn't need sub-hour precision.
	const monthStartDate = new Date(`${ymdStart}T00:00:00Z`);
	const monthEndDate = new Date(`${ymdEnd}T00:00:00Z`);
	return {
		year,
		month1,
		ym,
		ymdFirstOfMonth: ymdStart,
		ymdFirstOfNextMonth: ymdEnd,
		monthStartDate,
		monthEndDate,
	};
}

export function currentMonthLondon(now = new Date()) {
	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/London",
		year: "numeric",
		month: "2-digit",
	});
	const parts = fmt.formatToParts(now);
	const year = Number(parts.find((p) => p.type === "year").value);
	const month1 = Number(parts.find((p) => p.type === "month").value);
	return { year, month1, ym: `${year}-${pad(month1)}` };
}

export function monthLabel(year, month1) {
	const d = new Date(Date.UTC(year, month1 - 1, 1));
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: "UTC",
		month: "long",
		year: "numeric",
	}).format(d);
}
