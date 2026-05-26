import { getCurrentVenue } from "@/db/queries/venue.js";
import { listPublicCalendarItemsInRange } from "@/db/queries/calendar.js";

export const dynamic = "force-dynamic";

/**
 * Public iCal feed for all public rooms. Calendar apps poll this URL on
 * their own schedule; we serve a generous window (-30d to +180d) so users
 * see both recent history and a healthy view of the future without their
 * client having to do anything clever.
 *
 * Output is RFC 5545 text/calendar. Line endings must be CRLF; long
 * lines should be folded but our content is short enough that we don't
 * need to bother in practice.
 */
export async function GET(req) {
	// Same security-by-obscurity gate as the calendar page. Calendar
	// apps subscribe to this URL and re-fetch periodically, so the key
	// stays embedded in the subscription URL once added.
	const requiredKey = process.env.PUBLIC_CALENDAR_KEY;
	if (requiredKey) {
		const url = new URL(req.url);
		const provided = url.searchParams.get("key");
		if (provided !== requiredKey) {
			return new Response("Not found", { status: 404 });
		}
	}

	const venue = await getCurrentVenue();
	if (!venue) {
		return new Response("VENUE NOT CONFIGURED", { status: 404 });
	}

	const now = new Date();
	const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	const end = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
	const items = await listPublicCalendarItemsInRange(venue.id, start, end);

	const lines = [];
	lines.push("BEGIN:VCALENDAR");
	lines.push("VERSION:2.0");
	lines.push(`PRODID:-//${venue.name}//Room calendar//EN`);
	lines.push("CALSCALE:GREGORIAN");
	lines.push("METHOD:PUBLISH");
	lines.push(`X-WR-CALNAME:${escapeText(`${venue.name} – Room calendar`)}`);
	lines.push(`X-WR-CALDESC:${escapeText(`When the rooms are in use at ${venue.name}.`)}`);
	lines.push("X-WR-TIMEZONE:Europe/London");

	for (const it of items) {
		const uid = `${it.id}@${venueDomain(venue)}`;
		const roomNames = (it.rooms ?? []).map((r) => r.room_name);
		const roomsLabel = roomNames.join(", ");
		const summary = roomsLabel
			? `${it.title} - ${roomsLabel}`
			: it.title;
		lines.push("BEGIN:VEVENT");
		lines.push(`UID:${uid}`);
		lines.push(`DTSTAMP:${toIcalUtc(now)}`);
		lines.push(`DTSTART:${toIcalUtc(it.starts_at)}`);
		lines.push(`DTEND:${toIcalUtc(it.ends_at)}`);
		lines.push(`SUMMARY:${escapeText(summary)}`);
		if (it.reason && it.reason !== it.title) {
			lines.push(`DESCRIPTION:${escapeText(it.reason)}`);
		}
		if (roomsLabel) {
			lines.push(`LOCATION:${escapeText(roomsLabel)}`);
		}
		lines.push(`CATEGORIES:${escapeText(it.kind.toUpperCase())}`);
		// Bookings that haven't yet been confirmed (deposit paid) carry
		// RFC 5545 STATUS:TENTATIVE so subscribers can dim them - matches
		// the dashed-border treatment on the calendar UI.
		lines.push(it.tentative ? "STATUS:TENTATIVE" : "STATUS:CONFIRMED");
		lines.push("END:VEVENT");
	}

	lines.push("END:VCALENDAR");
	const body = lines.join("\r\n") + "\r\n";

	return new Response(body, {
		status: 200,
		headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			"Cache-Control": "public, max-age=300, s-maxage=300",
			"Content-Disposition": 'inline; filename="rooms.ics"',
		},
	});
}

function venueDomain(venue) {
	const slug = (venue.slug ?? venue.name ?? "venue")
		.toString()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return `${slug || "venue"}.nexus`;
}

function toIcalUtc(value) {
	const d = value instanceof Date ? value : new Date(value);
	const y = d.getUTCFullYear();
	const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
	const da = String(d.getUTCDate()).padStart(2, "0");
	const h = String(d.getUTCHours()).padStart(2, "0");
	const mi = String(d.getUTCMinutes()).padStart(2, "0");
	const s = String(d.getUTCSeconds()).padStart(2, "0");
	return `${y}${mo}${da}T${h}${mi}${s}Z`;
}

function escapeText(s) {
	return String(s ?? "")
		.replace(/\\/g, "\\\\")
		.replace(/\r?\n/g, "\\n")
		.replace(/,/g, "\\,")
		.replace(/;/g, "\\;");
}
