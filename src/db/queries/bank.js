import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { bank_account } from "@/db/schema/entities/bank_account.js";
import { bank_transaction } from "@/db/schema/entities/bank_transaction.js";
import { bank_balance_snapshot } from "@/db/schema/entities/bank_balance_snapshot.js";

/**
 * Active bank accounts for a venue, ordered by sort then created.
 */
export async function listBankAccounts(venueId, { includeInactive = false } = {}) {
	const conditions = [
		eq(bank_account.venue_id, venueId),
		isNull(bank_account.deletedAt),
	];
	if (!includeInactive) conditions.push(eq(bank_account.is_active, true));
	return db
		.select()
		.from(bank_account)
		.where(and(...conditions))
		.orderBy(asc(bank_account.sort_order), asc(bank_account.createdAt));
}

export async function getBankAccountById(id, { venueId } = {}) {
	const conditions = [eq(bank_account.id, id), isNull(bank_account.deletedAt)];
	if (venueId) conditions.push(eq(bank_account.venue_id, venueId));
	const [row] = await db
		.select()
		.from(bank_account)
		.where(and(...conditions))
		.limit(1);
	return row ?? null;
}

function accountFilter(accountIds) {
	if (!accountIds || accountIds.length === 0) return null;
	return inArray(bank_transaction.bank_account_id, accountIds);
}

function snapshotAccountFilter(accountIds) {
	if (!accountIds || accountIds.length === 0) return null;
	return inArray(bank_balance_snapshot.bank_account_id, accountIds);
}

/**
 * Latest snapshot per bank account for the venue, optionally filtered to a
 * subset. Returned as an array — `combineLatestSnapshots` sums them when
 * the caller wants a single combined balance.
 */
export async function listLatestBalanceSnapshots(venueId, { accountIds } = {}) {
	const filter = snapshotAccountFilter(accountIds);
	const rows = await db.execute(sql`
		SELECT DISTINCT ON (bank_account_id)
			bank_account_id,
			cleared_minor,
			effective_minor,
			pending_minor,
			currency,
			captured_at
		FROM bank_balance_snapshot
		WHERE venue_id = ${venueId}
			AND bank_account_id IS NOT NULL
			${filter ? sql`AND ${filter}` : sql``}
		ORDER BY bank_account_id, captured_at DESC
	`);
	return rows.map((r) => ({
		bank_account_id: r.bank_account_id,
		cleared_minor: Number(r.cleared_minor) || 0,
		effective_minor: Number(r.effective_minor) || 0,
		pending_minor: Number(r.pending_minor) || 0,
		currency: r.currency,
		captured_at: r.captured_at,
	}));
}

/**
 * Sum of the latest snapshots across (filtered) accounts — the combined
 * "cash on hand" number used by the dashboard widget and Banking page
 * cards. Returns null when no snapshots exist yet.
 */
export async function getCombinedLatestBalance(venueId, { accountIds } = {}) {
	const snaps = await listLatestBalanceSnapshots(venueId, { accountIds });
	if (snaps.length === 0) return null;
	let cleared = 0;
	let effective = 0;
	let pending = 0;
	let latestAt = null;
	const currency = snaps[0].currency || "GBP";
	for (const s of snaps) {
		cleared += s.cleared_minor;
		effective += s.effective_minor;
		pending += s.pending_minor;
		if (!latestAt || new Date(s.captured_at) > new Date(latestAt)) {
			latestAt = s.captured_at;
		}
	}
	return {
		cleared_minor: cleared,
		effective_minor: effective,
		pending_minor: pending,
		currency,
		captured_at: latestAt,
		account_count: snaps.length,
	};
}

/**
 * In/out totals over a date range, keyed off settled_at. Excludes
 * `is_transfer` rows so the figure reflects external money movement only.
 */
export async function getBankInOutBetween(venueId, fromDate, toDate, { accountIds } = {}) {
	const filter = accountFilter(accountIds);
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
				eq(bank_transaction.is_transfer, false),
				sql`${bank_transaction.settled_at} >= ${fromDate.toISOString()}`,
				sql`${bank_transaction.settled_at} < ${toDate.toISOString()}`,
				...(filter ? [filter] : []),
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
export async function listBankTransactions(venueId, { limit = 50, offset = 0, accountIds } = {}) {
	const filter = accountFilter(accountIds);
	const where = filter
		? and(eq(bank_transaction.venue_id, venueId), filter)
		: eq(bank_transaction.venue_id, venueId);
	const [rows, [{ count }]] = await Promise.all([
		db
			.select()
			.from(bank_transaction)
			.where(where)
			.orderBy(
				desc(sql`COALESCE(${bank_transaction.settled_at}, ${bank_transaction.transaction_time})`),
			)
			.limit(limit)
			.offset(offset),
		db
			.select({ count: sql`COUNT(*)::int`.as("count") })
			.from(bank_transaction)
			.where(where),
	]);
	return { rows, total: Number(count) || 0 };
}

/**
 * Combined balance-over-time series. For each bucket, takes the latest
 * snapshot of each account in that bucket, then sums across accounts so
 * the chart shows a single "total cash" line. Buckets are day/week/month.
 */
export async function listBankBalanceSeries(venueId, { bucket = "day", fromDate, toDate, accountIds } = {}) {
	const truncUnit =
		bucket === "month" ? "month" : bucket === "week" ? "week" : "day";
	const trunc = sql.raw(`DATE_TRUNC('${truncUnit}', captured_at)`);
	const fromIso = fromDate ? fromDate.toISOString() : null;
	const toIso = toDate ? toDate.toISOString() : null;
	const filter = snapshotAccountFilter(accountIds);
	const rows = await db.execute(sql`
		WITH per_account AS (
			SELECT DISTINCT ON (${trunc}, bank_account_id)
				${trunc} AS bucket_start,
				bank_account_id,
				cleared_minor,
				effective_minor,
				currency
			FROM bank_balance_snapshot
			WHERE venue_id = ${venueId}
				AND bank_account_id IS NOT NULL
				${fromIso ? sql`AND captured_at >= ${fromIso}` : sql``}
				${toIso ? sql`AND captured_at < ${toIso}` : sql``}
				${filter ? sql`AND ${filter}` : sql``}
			ORDER BY ${trunc}, bank_account_id, captured_at DESC
		)
		SELECT
			bucket_start,
			SUM(cleared_minor)::bigint AS cleared_minor,
			SUM(effective_minor)::bigint AS effective_minor,
			MAX(currency) AS currency
		FROM per_account
		GROUP BY bucket_start
		ORDER BY bucket_start ASC
	`);
	return rows.map((r) => ({
		bucket_start: r.bucket_start,
		cleared_minor: Number(r.cleared_minor) || 0,
		effective_minor: Number(r.effective_minor) || 0,
		currency: r.currency,
	}));
}
