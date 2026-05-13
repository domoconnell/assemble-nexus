import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { bank_transaction } from "@/db/schema/entities/bank_transaction.js";
import { bank_balance_snapshot } from "@/db/schema/entities/bank_balance_snapshot.js";

export async function getLatestBalanceSnapshot(venueId) {
	const [row] = await db
		.select()
		.from(bank_balance_snapshot)
		.where(eq(bank_balance_snapshot.venue_id, venueId))
		.orderBy(desc(bank_balance_snapshot.captured_at))
		.limit(1);
	return row ?? null;
}

/**
 * In/out totals over a date range, keyed off settled_at (so unsettled
 * pending items aren't counted yet). Returns minor units.
 */
export async function getBankInOutBetween(venueId, fromDate, toDate) {
	const rows = await db
		.select({
			direction: bank_transaction.direction,
			total: sql`COALESCE(SUM(${bank_transaction.amount_minor}), 0)::bigint`.as("total"),
		})
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.venue_id, venueId),
				isNotNull(bank_transaction.settled_at),
				sql`${bank_transaction.settled_at} >= ${fromDate.toISOString()}`,
				sql`${bank_transaction.settled_at} < ${toDate.toISOString()}`,
			),
		)
		.groupBy(bank_transaction.direction);
	let in_minor = 0;
	let out_minor = 0;
	for (const r of rows) {
		const total = Number(r.total) || 0;
		if (r.direction === "IN") in_minor = total;
		if (r.direction === "OUT") out_minor = total;
	}
	return { in_minor, out_minor, net_minor: in_minor - out_minor };
}

/**
 * Paginated transaction list, newest first by settled_at (falls back to
 * transaction_time for items that haven't settled).
 */
export async function listBankTransactions(venueId, { limit = 50, offset = 0 } = {}) {
	const [rows, [{ count }]] = await Promise.all([
		db
			.select()
			.from(bank_transaction)
			.where(eq(bank_transaction.venue_id, venueId))
			.orderBy(
				desc(sql`COALESCE(${bank_transaction.settled_at}, ${bank_transaction.transaction_time})`),
			)
			.limit(limit)
			.offset(offset),
		db
			.select({ count: sql`COUNT(*)::int`.as("count") })
			.from(bank_transaction)
			.where(eq(bank_transaction.venue_id, venueId)),
	]);
	return { rows, total: Number(count) || 0 };
}

/**
 * Time-series points for the balance chart, bucketed by day/week/month.
 * One point per bucket (the latest snapshot captured within it). Returned
 * in chronological order so Recharts can plot left-to-right.
 */
export async function listBankBalanceSeries(venueId, { bucket = "day", fromDate, toDate } = {}) {
	// DATE_TRUNC's unit must be a literal at parse time, not a bound param —
	// allowlist the value and inline it as raw SQL.
	const truncUnit =
		bucket === "month" ? "month" : bucket === "week" ? "week" : "day";
	const trunc = sql.raw(`DATE_TRUNC('${truncUnit}', captured_at)`);
	const fromIso = fromDate ? fromDate.toISOString() : null;
	const toIso = toDate ? toDate.toISOString() : null;
	const rows = await db.execute(sql`
		SELECT DISTINCT ON (${trunc})
			${trunc} AS bucket_start,
			cleared_minor,
			effective_minor,
			currency,
			captured_at
		FROM bank_balance_snapshot
		WHERE venue_id = ${venueId}
			${fromIso ? sql`AND captured_at >= ${fromIso}` : sql``}
			${toIso ? sql`AND captured_at < ${toIso}` : sql``}
		ORDER BY ${trunc} ASC, captured_at DESC
	`);
	return rows.map((r) => ({
		bucket_start: r.bucket_start,
		cleared_minor: Number(r.cleared_minor) || 0,
		effective_minor: Number(r.effective_minor) || 0,
		currency: r.currency,
		captured_at: r.captured_at,
	}));
}
