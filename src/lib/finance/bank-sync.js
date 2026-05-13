import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { bank_transaction } from "@/db/schema/entities/bank_transaction.js";
import { bank_balance_snapshot } from "@/db/schema/entities/bank_balance_snapshot.js";
import {
	getStarlingSettings,
	saveSetting,
} from "@/db/queries/settings.js";
import {
	listStarlingTransactions,
	fetchStarlingBalance,
	listStarlingAccounts,
} from "./starling.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BACKFILL_DAYS = 400; // ~13 months — covers worst-case first-run

/**
 * Sync a venue's Starling account: pull transactions since `last_synced_at`
 * (or back to account creation for a first run), upsert them, then capture
 * a fresh balance snapshot.
 *
 * Idempotent — upserts by Starling's `feedItemUid` so a re-run within a
 * window doesn't duplicate rows.
 */
export async function syncStarlingForVenue(venueId, { force = false } = {}) {
	let settings = await getStarlingSettings(venueId);
	if (!settings?.access_token || !settings?.account_uid) {
		return { ok: false, reason: "not-configured" };
	}

	// Self-heal: settings saved before the default_category lookup existed
	// won't have one. Resolve it now from Starling and persist so subsequent
	// runs are fast.
	if (!settings.default_category) {
		const lookup = await listStarlingAccounts(settings.access_token);
		if (!lookup.ok) {
			return { ok: false, reason: "account-lookup-failed", error: lookup.error };
		}
		const match = lookup.accounts.find((a) => a.accountUid === settings.account_uid);
		if (!match?.defaultCategory) {
			return { ok: false, reason: "default-category-not-found-for-account" };
		}
		settings = { ...settings, default_category: match.defaultCategory };
		await saveSetting(venueId, "starling", settings);
	}

	const now = new Date();
	const lastSyncedAt = settings.last_synced_at ? new Date(settings.last_synced_at) : null;
	const from = force
		? new Date(now.getTime() - MAX_BACKFILL_DAYS * ONE_DAY_MS)
		: lastSyncedAt
			? new Date(lastSyncedAt.getTime() - 2 * ONE_DAY_MS) // small overlap to catch late-settling items
			: new Date(now.getTime() - MAX_BACKFILL_DAYS * ONE_DAY_MS);
	const to = new Date(now.getTime() + 5 * 60 * 1000); // tiny look-ahead for clock skew

	const txs = await listStarlingTransactions({
		token: settings.access_token,
		accountUid: settings.account_uid,
		categoryUid: settings.default_category,
		from,
		to,
	});
	if (!txs.ok) {
		return { ok: false, reason: "transactions-fetch-failed", error: txs.error };
	}

	let inserted = 0;
	let updated = 0;
	for (const item of txs.feedItems) {
		const direction = item.direction === "IN" ? "IN" : "OUT";
		const amountMinor = item.amount?.minorUnits ?? 0;
		const currency = item.amount?.currency ?? "GBP";
		const settledAt = item.settlementTime ? new Date(item.settlementTime) : null;
		const transactionTime = item.transactionTime ? new Date(item.transactionTime) : null;
		const counterpartyName = item.counterPartyName ?? null;
		const counterpartyAccount =
			item.counterPartySubEntityIdentifier ??
			item.counterPartyIdentifier ??
			null;
		const reference = item.reference ?? null;

		const values = {
			venue_id: venueId,
			external_id: item.feedItemUid,
			direction,
			amount_minor: amountMinor,
			currency,
			counterparty_name: counterpartyName,
			counterparty_account: counterpartyAccount,
			reference,
			category_uid: item.categoryUid ?? settings.default_category,
			source: "starling",
			settled_at: settledAt,
			transaction_time: transactionTime,
			raw_payload: item,
		};

		const result = await db
			.insert(bank_transaction)
			.values(values)
			.onConflictDoUpdate({
				target: [bank_transaction.venue_id, bank_transaction.external_id],
				set: {
					direction: values.direction,
					amount_minor: values.amount_minor,
					currency: values.currency,
					counterparty_name: values.counterparty_name,
					counterparty_account: values.counterparty_account,
					reference: values.reference,
					settled_at: values.settled_at,
					transaction_time: values.transaction_time,
					raw_payload: values.raw_payload,
				},
			})
			.returning({ id: bank_transaction.id, createdAt: bank_transaction.createdAt, updatedAt: bank_transaction.updatedAt });
		if (result[0]) {
			if (result[0].createdAt.getTime() === result[0].updatedAt.getTime()) inserted++;
			else updated++;
		}
	}

	const balance = await fetchStarlingBalance({
		token: settings.access_token,
		accountUid: settings.account_uid,
	});
	if (balance.ok) {
		await db.insert(bank_balance_snapshot).values({
			venue_id: venueId,
			cleared_minor: balance.cleared_minor,
			effective_minor: balance.effective_minor,
			pending_minor: balance.pending_minor,
			currency: balance.currency,
			source: "starling",
			captured_at: now,
		});
	}

	// On a force-backfill, also synthesise historical end-of-day balance
	// points from the transaction history so the chart has something to
	// draw before the cron starts laying down nightly snapshots.
	let backfilled = 0;
	if (force && balance.ok) {
		backfilled = await backfillBalanceFromTransactions(venueId, {
			currentClearedMinor: balance.cleared_minor,
			currency: balance.currency,
			today: now,
			daysBack: 360,
		});
	}

	await saveSetting(venueId, "starling", {
		...settings,
		last_synced_at: now.toISOString(),
		last_sync_inserted: inserted,
		last_sync_updated: updated,
		last_sync_error: null,
	});

	return {
		ok: true,
		inserted,
		updated,
		backfilled,
		balance: balance.ok ? balance : null,
		from: from.toISOString(),
		to: to.toISOString(),
	};
}

/**
 * Derive one end-of-day balance snapshot per day in the window, working
 * backwards from the current cleared balance using the transaction history.
 *
 * `source = 'starling-derived'` marks these as synthetic so a re-run can
 * safely wipe + regenerate without touching the real cron-captured
 * snapshots (`source = 'starling'`).
 */
export async function backfillBalanceFromTransactions(venueId, {
	currentClearedMinor,
	currency = "GBP",
	today,
	daysBack = 360,
}) {
	const windowStart = startOfUtcDay(new Date(today.getTime() - daysBack * ONE_DAY_MS));
	const endOfToday = endOfUtcDay(today);

	const txs = await db
		.select({
			direction: bank_transaction.direction,
			amount_minor: bank_transaction.amount_minor,
			settled_at: bank_transaction.settled_at,
		})
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.venue_id, venueId),
				isNotNull(bank_transaction.settled_at),
				gte(bank_transaction.settled_at, windowStart),
			),
		)
		.orderBy(asc(bank_transaction.settled_at));

	// Bucket transactions by UTC day-key (YYYY-MM-DD). For each day we'll
	// add the net delta to the running balance at end-of-day.
	const deltaByDay = new Map();
	let totalDeltaInWindow = 0;
	for (const t of txs) {
		const delta = t.direction === "IN" ? t.amount_minor : -t.amount_minor;
		totalDeltaInWindow += delta;
		const k = utcDayKey(new Date(t.settled_at));
		deltaByDay.set(k, (deltaByDay.get(k) ?? 0) + delta);
	}

	// Balance at the start of the window = current - all deltas since then.
	// Walking forward day by day, we apply each day's delta to get the
	// end-of-day balance. The very last point will equal the live balance
	// (modulo any pending tx that hasn't settled — close enough for a chart).
	const startingBalance = currentClearedMinor - totalDeltaInWindow;

	// Wipe any prior derived rows in the window so reruns don't pile up.
	await db
		.delete(bank_balance_snapshot)
		.where(
			and(
				eq(bank_balance_snapshot.venue_id, venueId),
				eq(bank_balance_snapshot.source, "starling-derived"),
				gte(bank_balance_snapshot.captured_at, windowStart),
			),
		);

	const inserts = [];
	let running = startingBalance;
	for (
		let dayStart = new Date(windowStart);
		dayStart <= endOfToday;
		dayStart = new Date(dayStart.getTime() + ONE_DAY_MS)
	) {
		const k = utcDayKey(dayStart);
		const dayDelta = deltaByDay.get(k) ?? 0;
		running += dayDelta;
		const captured = endOfUtcDay(dayStart);
		// Don't write a derived point for "today" — the live snapshot we
		// just captured covers it.
		if (captured >= endOfToday) continue;
		inserts.push({
			venue_id: venueId,
			cleared_minor: running,
			effective_minor: running,
			pending_minor: 0,
			currency,
			source: "starling-derived",
			captured_at: captured,
		});
	}

	if (inserts.length === 0) return 0;
	// Insert in chunks of 200 to keep individual statements small.
	for (let i = 0; i < inserts.length; i += 200) {
		await db.insert(bank_balance_snapshot).values(inserts.slice(i, i + 200));
	}
	return inserts.length;
}

function startOfUtcDay(d) {
	const x = new Date(d);
	x.setUTCHours(0, 0, 0, 0);
	return x;
}
function endOfUtcDay(d) {
	const x = new Date(d);
	x.setUTCHours(23, 59, 59, 999);
	return x;
}
function utcDayKey(d) {
	return d.toISOString().slice(0, 10);
}

/**
 * Get the most recent balance snapshot for a venue (used by the dashboard
 * widget when we want fast reads without hitting Starling).
 */
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
 * Sum of in/out transactions for a venue between two dates.
 */
export async function getBankInOutBetween(venueId, fromDate, toDate) {
	const rows = await db
		.select({
			direction: bank_transaction.direction,
			total: sql`COALESCE(SUM(${bank_transaction.amount_minor}), 0)::int`.as("total"),
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
		if (r.direction === "IN") in_minor = Number(r.total) || 0;
		if (r.direction === "OUT") out_minor = Number(r.total) || 0;
	}
	return { in_minor, out_minor, net_minor: in_minor - out_minor };
}
