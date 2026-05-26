import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCurrentVenue } from "@/db/queries/venue";
import {
	listPublicCalendarItemsInRange,
	listPublicRoomsForCalendar,
} from "@/db/queries/calendar";
import CalendarView from "./_view";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "Room calendar",
	description: "When the rooms are in use.",
	robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

const VIEWS = new Set(["month", "week", "year"]);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function pad(n) {
	return String(n).padStart(2, "0");
}

function londonYmd(date) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/London",
		year: "numeric", month: "2-digit", day: "2-digit",
	}).format(date);
}

function parseYmd(s) {
	const [y, m, d] = s.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

function startOfWeekMonday(d) {
	const out = new Date(d);
	const dow = (out.getUTCDay() + 6) % 7; // Monday = 0
	out.setUTCDate(out.getUTCDate() - dow);
	out.setUTCHours(0, 0, 0, 0);
	return out;
}

function startOfMonth(d) {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfYear(d) {
	return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

/**
 * Compute the data window for each view. We over-fetch on the month view
 * so the leading/trailing grid days from neighbouring months still have
 * their events. Week + year fetch their own natural window.
 */
function windowFor(view, anchor) {
	if (view === "week") {
		const start = startOfWeekMonday(anchor);
		const end = new Date(start);
		end.setUTCDate(end.getUTCDate() + 7);
		return { start, end };
	}
	if (view === "year") {
		const start = startOfYear(anchor);
		const end = new Date(Date.UTC(anchor.getUTCFullYear() + 1, 0, 1));
		return { start, end };
	}
	// month
	const monthStart = startOfMonth(anchor);
	const start = startOfWeekMonday(monthStart);
	const end = new Date(start);
	end.setUTCDate(end.getUTCDate() + 42); // 6 weeks of grid coverage
	return { start, end };
}

export default async function CalendarPage({ searchParams }) {
	const sp = await searchParams;

	// Security-by-obscurity gate. When PUBLIC_CALENDAR_KEY is set in the
	// env, every page + feed request must carry `?key=<that value>` to
	// pass. Unset in dev = no gate, so local development stays painless.
	const requiredKey = process.env.PUBLIC_CALENDAR_KEY;
	if (requiredKey) {
		const provided = typeof sp?.key === "string" ? sp.key : null;
		if (provided !== requiredKey) notFound();
	}

	const venue = await getCurrentVenue();
	if (!venue) {
		return (
			<div className="min-h-screen flex items-center justify-center px-4">
				<div className="text-sm text-muted-foreground">
					Calendar isn&apos;t available yet.
				</div>
			</div>
		);
	}

	const view = VIEWS.has(sp?.view) ? sp.view : "month";
	const dParam = typeof sp?.d === "string" && YMD.test(sp.d) ? sp.d : null;
	const anchor = dParam ? parseYmd(dParam) : parseYmd(londonYmd(new Date()));
	const rParam = typeof sp?.r === "string" ? sp.r : null;
	const roomIds = rParam ? rParam.split(",").filter(Boolean) : null;

	const rooms = await listPublicRoomsForCalendar(venue.id);

	const { start, end } = windowFor(view, anchor);
	const items = await listPublicCalendarItemsInRange(venue.id, start, end, {
		roomIds: roomIds && roomIds.length > 0 ? roomIds : undefined,
	});

	const hdrs = await headers();
	const proto = hdrs.get("x-forwarded-proto") || "https";
	const host = hdrs.get("host") || "localhost:3000";
	// Carry the gate key through to the iCal feed when one is configured,
	// so subscriptions keep working without the user having to know.
	const feedQuery = requiredKey ? `?key=${encodeURIComponent(requiredKey)}` : "";
	const subscribeUrl = `webcal://${host}/calendar/feed.ics${feedQuery}`;
	const httpsSubscribeUrl = `${proto}://${host}/calendar/feed.ics${feedQuery}`;

	return (
		<CalendarView
			venueName={venue.name}
			view={view}
			anchorYmd={`${anchor.getUTCFullYear()}-${pad(anchor.getUTCMonth() + 1)}-${pad(anchor.getUTCDate())}`}
			rooms={rooms}
			selectedRoomIds={roomIds}
			items={items.map((it) => ({
				...it,
				starts_at: typeof it.starts_at === "string" ? it.starts_at : new Date(it.starts_at).toISOString(),
				ends_at: typeof it.ends_at === "string" ? it.ends_at : new Date(it.ends_at).toISOString(),
			}))}
			windowStartIso={start.toISOString()}
			windowEndIso={end.toISOString()}
			subscribeUrl={subscribeUrl}
			httpsSubscribeUrl={httpsSubscribeUrl}
		/>
	);
}
