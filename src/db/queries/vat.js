import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { booking } from "@/db/schema/entities/booking.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { event } from "@/db/schema/entities/event.js";
import { pos_daily_takings } from "@/db/schema/entities/pos_daily_takings.js";

/**
 * VAT return rollup for a date range. Cash-basis: each stream is keyed off
 * the natural "money received" timestamp.
 *
 *   bookings    → confirmed_at  (booking firm, deposit paid)
 *   tickets     → paid_at       (delegate paid)
 *   POS         → date          (each day's takings)
 *
 * Returns gross/vat/net per stream plus a totals row. Input VAT (on
 * expenses) is NOT yet tracked — the expense schema doesn't have a VAT
 * column. The page surfaces that gap to the user.
 */
export async function getVatReturnRollup(venueId, { fromDate, toDate }) {
	const fromIso = fromDate.toISOString();
	const toIso = toDate.toISOString();
	const fromYmd = fromDate.toISOString().slice(0, 10);
	const toYmd = toDate.toISOString().slice(0, 10);

	const [[bookingsRow], [ticketsRow], [posRow]] = await Promise.all([
		db
			.select({
				gross_cents: sql`COALESCE(SUM(${booking.total_cents}), 0)::bigint`.as("gross"),
				vat_cents: sql`COALESCE(SUM(${booking.vat_cents}), 0)::bigint`.as("vat"),
				count: sql`COUNT(*)::int`.as("count"),
			})
			.from(booking)
			.where(
				and(
					eq(booking.venue_id, venueId),
					isNull(booking.deletedAt),
					gte(booking.confirmed_at, fromDate),
					lt(booking.confirmed_at, toDate),
				),
			),
		db
			.select({
				gross_cents: sql`COALESCE(SUM(${ticket_order.total_cents}), 0)::bigint`.as("gross"),
				vat_cents: sql`COALESCE(SUM(${ticket_order.vat_cents}), 0)::bigint`.as("vat"),
				count: sql`COUNT(*)::int`.as("count"),
			})
			.from(ticket_order)
			.innerJoin(event, eq(event.id, ticket_order.event_id))
			.where(
				and(
					eq(event.venue_id, venueId),
					isNull(ticket_order.deletedAt),
					sql`${ticket_order.status} IN ('paid','partially_refunded')`,
					gte(ticket_order.paid_at, fromDate),
					lt(ticket_order.paid_at, toDate),
				),
			),
		db
			.select({
				gross_cents: sql`COALESCE(SUM(${pos_daily_takings.gross_cents}), 0)::bigint`.as("gross"),
				vat_cents: sql`COALESCE(SUM(${pos_daily_takings.vat_cents}), 0)::bigint`.as("vat"),
				count: sql`COUNT(*)::int`.as("count"),
			})
			.from(pos_daily_takings)
			.where(
				and(
					eq(pos_daily_takings.venue_id, venueId),
					sql`${pos_daily_takings.date} >= ${fromYmd}`,
					sql`${pos_daily_takings.date} < ${toYmd}`,
				),
			),
	]);

	const streams = [
		{
			key: "bookings",
			label: "Bookings (room hire)",
			date_basis: "confirmed_at",
			gross_cents: Number(bookingsRow?.gross_cents) || 0,
			vat_cents: Number(bookingsRow?.vat_cents) || 0,
			count: Number(bookingsRow?.count) || 0,
		},
		{
			key: "tickets",
			label: "Ticket sales",
			date_basis: "paid_at",
			gross_cents: Number(ticketsRow?.gross_cents) || 0,
			vat_cents: Number(ticketsRow?.vat_cents) || 0,
			count: Number(ticketsRow?.count) || 0,
		},
		{
			key: "pos",
			label: "POS (café & bar)",
			date_basis: "date",
			gross_cents: Number(posRow?.gross_cents) || 0,
			vat_cents: Number(posRow?.vat_cents) || 0,
			count: Number(posRow?.count) || 0,
		},
	];

	const totals = streams.reduce(
		(acc, s) => ({
			gross_cents: acc.gross_cents + s.gross_cents,
			vat_cents: acc.vat_cents + s.vat_cents,
		}),
		{ gross_cents: 0, vat_cents: 0 },
	);
	totals.net_cents = totals.gross_cents - totals.vat_cents;
	for (const s of streams) {
		s.net_cents = s.gross_cents - s.vat_cents;
	}

	return {
		from: fromIso,
		to: toIso,
		streams,
		totals,
	};
}
