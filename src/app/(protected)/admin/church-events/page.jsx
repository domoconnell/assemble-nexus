import Link from "next/link";
import { and, asc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { room_blockout } from "@/db/schema/entities/room_blockout.js";
import { room_blockout_room } from "@/db/schema/entities/room_blockout_room.js";
import { room } from "@/db/schema/entities/room.js";
import { requireCurrentVenue } from "@/db/queries/venue";
import ChurchEventRow from "./_components/church-event-row";

export const dynamic = "force-dynamic";

const WEEKDAY_LABEL = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short", day: "numeric", month: "short", year: "numeric",
	hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
});

export default async function ChurchEventsPage() {
	const venue = await requireCurrentVenue();
	const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	// Series definitions = rows with recurrence_rule set
	const definitions = await db
		.select({
			id: room_blockout.id,
			series_id: room_blockout.series_id,
			reason: room_blockout.reason,
			recurrence_rule: room_blockout.recurrence_rule,
			notes: room_blockout.notes,
			is_public: room_blockout.is_public,
		})
		.from(room_blockout)
		.where(
			and(
				eq(room_blockout.venue_id, venue.id),
				eq(room_blockout.kind, "church"),
				isNotNull(room_blockout.recurrence_rule),
				isNull(room_blockout.deletedAt),
			),
		)
		.orderBy(asc(room_blockout.starts_at));

	// Adhoc rows = kind=church AND series_id IS NULL
	const adhoc = await db
		.select({
			id: room_blockout.id,
			starts_at: room_blockout.starts_at,
			ends_at: room_blockout.ends_at,
			reason: room_blockout.reason,
			notes: room_blockout.notes,
			is_public: room_blockout.is_public,
		})
		.from(room_blockout)
		.where(
			and(
				eq(room_blockout.venue_id, venue.id),
				eq(room_blockout.kind, "church"),
				isNull(room_blockout.series_id),
				isNull(room_blockout.deletedAt),
				gte(room_blockout.ends_at, cutoff),
			),
		)
		.orderBy(asc(room_blockout.starts_at));

	const allIds = [...definitions.map((d) => d.id), ...adhoc.map((a) => a.id)];
	const links = allIds.length
		? await db
				.select({
					blockout_id: room_blockout_room.blockout_id,
					room_id: room_blockout_room.room_id,
					room_name: room.name,
				})
				.from(room_blockout_room)
				.innerJoin(room, eq(room.id, room_blockout_room.room_id))
				.where(inArray(room_blockout_room.blockout_id, allIds))
		: [];
	const roomsByBlockout = new Map();
	for (const l of links) {
		if (!roomsByBlockout.has(l.blockout_id)) roomsByBlockout.set(l.blockout_id, []);
		roomsByBlockout.get(l.blockout_id).push(l.room_name);
	}

	function roomsFor(id) {
		const list = roomsByBlockout.get(id) ?? [];
		return list.length === 0 ? "All rooms" : list.join(", ");
	}

	function describeRule(rule) {
		if (!rule) return "";
		if (rule.kind === "weekly") {
			const days = (rule.by_weekday || []).map((d) => WEEKDAY_LABEL[d] ?? d).join(", ");
			return `${days} · ${rule.time_start}-${rule.time_end}${rule.ends_on ? ` (ends ${rule.ends_on})` : " (ongoing)"}`;
		}
		if (rule.kind === "run") {
			return `${rule.weeks}× ${WEEKDAY_LABEL[rule.weekday] ?? rule.weekday} · ${rule.time_start}-${rule.time_end} from ${rule.starts_on}`;
		}
		return "";
	}

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div>
					<h1 className="text-2xl font-semibold">Church events</h1>
					<p className="mt-1 text-sm text-muted-foreground max-w-2xl">
						Church use of the building. Weekly recurring (e.g. Sunday morning),
						finite runs (e.g. a 6-week course), or one-off adhoc events. All
						block rooms on the calendar in the same way booking segments do.
					</p>
				</div>
				<Link
					href="/admin/church-events/new"
					className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
				>
					New church event
				</Link>
			</div>

			<section className="space-y-3">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Recurring &amp; runs · {definitions.length}
				</h2>
				{definitions.length === 0 ? (
					<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
						No recurring series yet.
					</div>
				) : (
					<ul className="rounded-lg border bg-card divide-y divide-foreground/10 overflow-hidden">
						{definitions.map((d) => (
							<ChurchEventRow
								key={d.id}
								id={d.id}
								seriesId={d.series_id}
								title={d.reason}
								subtitle={`${describeRule(d.recurrence_rule)} · ${roomsFor(d.id)}`}
								notes={d.notes}
								isSeries
							/>
						))}
					</ul>
				)}
			</section>

			<section className="space-y-3">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Adhoc &amp; upcoming · {adhoc.length}
				</h2>
				{adhoc.length === 0 ? (
					<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
						No one-off events scheduled.
					</div>
				) : (
					<ul className="rounded-lg border bg-card divide-y divide-foreground/10 overflow-hidden">
						{adhoc.map((a) => (
							<ChurchEventRow
								key={a.id}
								id={a.id}
								title={a.reason}
								subtitle={`${dateFmt.format(new Date(a.starts_at))} → ${dateFmt.format(new Date(a.ends_at))} · ${roomsFor(a.id)}`}
								notes={a.notes}
							/>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
