import { sql } from "drizzle-orm";
import { db } from "@/db/index.js";

/**
 * Top events by ticket-sales revenue. `revenue_cents` sums paid (and
 * partially-refunded - still net positive) order totals; `orders_count`
 * is the number of distinct paid orders. Optional date window applies
 * to the order's `paid_at` so an event opens a sales window without
 * appearing in months it didn't actually sell tickets.
 */
export async function getTopEventsBySales(venueId, { limit = 5, fromDate, toDate } = {}) {
	const fromIso = fromDate ? fromDate.toISOString() : null;
	const toIso = toDate ? toDate.toISOString() : null;
	return await db.execute(sql`
		SELECT
			e.id,
			e.title,
			e.slug,
			e.starts_at,
			e.status,
			COALESCE(SUM(o.total_cents), 0)::int AS revenue_cents,
			COUNT(DISTINCT o.id)::int AS orders_count
		FROM event e
		INNER JOIN ticket_order o ON o.event_id = e.id
		WHERE e.venue_id = ${venueId}
			AND e.deleted_at IS NULL
			AND o.status IN ('paid', 'partially_refunded')
			${fromIso ? sql`AND o.paid_at >= ${fromIso}` : sql``}
			${toIso ? sql`AND o.paid_at < ${toIso}` : sql``}
		GROUP BY e.id, e.title, e.slug, e.starts_at, e.status
		ORDER BY revenue_cents DESC
		LIMIT ${limit}
	`);
}

/**
 * Top hirers by booking revenue recognised in the date window. Mirrors
 * `sumBookingIncomeForMonth`: deposit_paid_cents counts at confirmed_at,
 * balance_paid_cents at balance_paid_at. Grouped by the booking's linked
 * organisation when set, otherwise by the customer's name. Used by the
 * board pack to show which hirers drove revenue in the month.
 */
export async function getTopHirersByBookingRevenue(venueId, { limit = 3, fromDate, toDate } = {}) {
	const fromIso = fromDate ? fromDate.toISOString() : null;
	const toIso = toDate ? toDate.toISOString() : null;
	return await db.execute(sql`
		WITH paid_in_window AS (
			SELECT
				COALESCE(
					org.name,
					NULLIF(TRIM(c.first_name || ' ' || c.last_name), ''),
					'Unknown'
				) AS hirer_name,
				org.id AS organisation_id,
				b.id AS booking_id,
				(
					CASE
						WHEN b.confirmed_at IS NOT NULL
							${fromIso ? sql`AND b.confirmed_at >= ${fromIso}` : sql``}
							${toIso ? sql`AND b.confirmed_at < ${toIso}` : sql``}
						THEN b.deposit_paid_cents
						ELSE 0
					END
					+
					CASE
						WHEN b.balance_paid_at IS NOT NULL
							${fromIso ? sql`AND b.balance_paid_at >= ${fromIso}` : sql``}
							${toIso ? sql`AND b.balance_paid_at < ${toIso}` : sql``}
						THEN b.balance_paid_cents
						ELSE 0
					END
				) AS revenue_cents
			FROM booking b
			LEFT JOIN organisation org ON org.id = b.organisation_id
			LEFT JOIN customer c ON c.id = b.customer_id
			WHERE b.venue_id = ${venueId}
				AND b.deleted_at IS NULL
		)
		SELECT
			hirer_name AS name,
			organisation_id,
			COUNT(DISTINCT booking_id)::int AS bookings_count,
			COALESCE(SUM(revenue_cents), 0)::int AS revenue_cents
		FROM paid_in_window
		GROUP BY hirer_name, organisation_id
		HAVING COALESCE(SUM(revenue_cents), 0) > 0
		ORDER BY revenue_cents DESC
		LIMIT ${limit}
	`);
}

/**
 * Revenue rollup grouped by the event's CRM organisation. Events without
 * an `organiser_organisation_id` (typically own-promoted house shows)
 * are excluded - they wouldn't have anything to credit anyway.
 */
export async function getPerOrganiserRevenue(venueId, { limit = 5, fromDate, toDate } = {}) {
	const fromIso = fromDate ? fromDate.toISOString() : null;
	const toIso = toDate ? toDate.toISOString() : null;
	return await db.execute(sql`
		SELECT
			org.id,
			org.name,
			COALESCE(SUM(o.total_cents), 0)::int AS revenue_cents,
			COUNT(DISTINCT e.id)::int AS events_count
		FROM organisation org
		INNER JOIN event e ON e.organiser_organisation_id = org.id
		INNER JOIN ticket_order o ON o.event_id = e.id
		WHERE e.venue_id = ${venueId}
			AND e.deleted_at IS NULL
			AND o.status IN ('paid', 'partially_refunded')
			${fromIso ? sql`AND o.paid_at >= ${fromIso}` : sql``}
			${toIso ? sql`AND o.paid_at < ${toIso}` : sql``}
		GROUP BY org.id, org.name
		ORDER BY revenue_cents DESC
		LIMIT ${limit}
	`);
}

/**
 * Current count of bookings by status, restricted to those submitted in
 * the last N months so the funnel reflects recent activity rather than
 * all-time history.
 */
export async function getBookingPipelineCounts(venueId, { monthsBack = 3 } = {}) {
	const since = new Date();
	since.setMonth(since.getMonth() - monthsBack);
	const rows = await db.execute(sql`
		SELECT status, COUNT(*)::int AS count
		FROM booking
		WHERE venue_id = ${venueId}
			AND deleted_at IS NULL
			AND created_at >= ${since.toISOString()}
		GROUP BY status
	`);
	const counts = { pending: 0, approved: 0, confirmed: 0, completed: 0, rejected: 0, cancelled: 0 };
	for (const r of rows) {
		if (r.status in counts) counts[r.status] = Number(r.count) || 0;
	}
	return counts;
}

/**
 * Unified feed of recent state changes - booking status events + ticket
 * orders flipping to paid - for the dashboard activity widget. Ordered
 * by occurrence, newest first.
 */
export async function getRecentActivity(venueId, { limit = 10 } = {}) {
	return await db.execute(sql`
		SELECT * FROM (
			SELECT
				'booking' AS kind,
				bse.id::text AS id,
				bse.at AS occurred_at,
				b.id::text AS subject_id,
				b.reference AS subject_ref,
				bse.from_status AS from_status,
				bse.to_status AS to_status,
				bse.note AS detail,
				c.first_name AS first_name,
				c.last_name AS last_name
			FROM booking_status_event bse
			INNER JOIN booking b ON b.id = bse.booking_id
			INNER JOIN customer c ON c.id = b.customer_id
			WHERE b.venue_id = ${venueId} AND b.deleted_at IS NULL
			UNION ALL
			SELECT
				'order' AS kind,
				o.id::text AS id,
				o.paid_at AS occurred_at,
				o.id::text AS subject_id,
				o.reference AS subject_ref,
				NULL AS from_status,
				'paid' AS to_status,
				e.title AS detail,
				c.first_name AS first_name,
				c.last_name AS last_name
			FROM ticket_order o
			INNER JOIN customer c ON c.id = o.customer_id
			INNER JOIN event e ON e.id = o.event_id
			WHERE e.venue_id = ${venueId}
				AND o.status IN ('paid', 'partially_refunded')
				AND o.paid_at IS NOT NULL
		) AS feed
		WHERE occurred_at IS NOT NULL
		ORDER BY occurred_at DESC
		LIMIT ${limit}
	`);
}
