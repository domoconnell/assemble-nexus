// Shared helpers for the calendar grids.

export const KIND_COLOUR = {
	external: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
	church: "bg-primary/15 text-primary border-primary/30",
	event: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
	closure: "bg-muted text-muted-foreground border-foreground/15",
};

export const KIND_DOT = {
	external: "bg-sky-500",
	church: "bg-primary",
	event: "bg-amber-500",
	closure: "bg-muted-foreground/40",
};

export function pad(n) {
	return String(n).padStart(2, "0");
}

export function londonDayKey(d) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/London",
		year: "numeric", month: "2-digit", day: "2-digit",
	}).format(d);
}

export const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
});

/**
 * Group items by their London-time day key. An item spanning multiple
 * days gets emitted under each day key it touches so the calendar shows
 * it on every day it occupies.
 */
export function groupItemsByDay(items) {
	const byDay = new Map();
	for (const it of items) {
		const start = new Date(it.starts_at);
		const end = new Date(it.ends_at);
		const oneDay = 24 * 60 * 60 * 1000;
		// Cap the walk at 31 days for safety; a single calendar item that
		// stretches a full month is unusual but possible.
		let cursor = new Date(start);
		for (let i = 0; i < 32 && cursor < end; i++) {
			const key = londonDayKey(cursor);
			if (!byDay.has(key)) byDay.set(key, []);
			byDay.get(key).push(it);
			cursor = new Date(cursor.getTime() + oneDay);
		}
	}
	return byDay;
}
