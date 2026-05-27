import { and, asc, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { bank_account } from "@/db/schema/entities/bank_account.js";
import { bank_transaction } from "@/db/schema/entities/bank_transaction.js";
import { bank_balance_snapshot } from "@/db/schema/entities/bank_balance_snapshot.js";
import { getProvider } from "./providers/index.js";
import { getChurchTransferSettings } from "@/db/queries/settings.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BACKFILL_DAYS = 400;

/**
 * Find active bank accounts for a venue (or all venues if `venueId` is
 * omitted). Returns the rows in a shape compatible with the provider
 * plugins.
 */
export async function listActiveBankAccounts(venueId) {
	const conditions = [eq(bank_account.is_active, true), isNull(bank_account.deletedAt)];
	if (venueId) conditions.push(eq(bank_account.venue_id, venueId));
	return db
		.select()
		.from(bank_account)
		.where(and(...conditions))
		.orderBy(asc(bank_account.sort_order), asc(bank_account.createdAt));
}

async function persistCredentials(accountId, credentials) {
	await db
		.update(bank_account)
		.set({ credentials })
		.where(eq(bank_account.id, accountId));
}

/**
 * Sync a single bank account: refresh creds if the plugin supports it,
 * pull transactions since the last sync, upsert them, take a balance
 * snapshot, then optionally walk transfer detection against the venue's
 * other accounts.
 */
export async function syncBankAccount(account, { force = false } = {}) {
	const provider = getProvider(account.provider);

	// 1. Refresh credentials if the plugin needs to (Revolut)
	if (provider.refreshCredentials) {
		const refreshed = await provider.refreshCredentials(account);
		if (refreshed && refreshed !== account) {
			await persistCredentials(account.id, refreshed.credentials);
			account = refreshed;
		}
	}

	const now = new Date();
	const lastSyncedAt = account.last_synced_at ? new Date(account.last_synced_at) : null;
	const from = force
		? new Date(now.getTime() - MAX_BACKFILL_DAYS * ONE_DAY_MS)
		: lastSyncedAt
			? new Date(lastSyncedAt.getTime() - 2 * ONE_DAY_MS)
			: new Date(now.getTime() - MAX_BACKFILL_DAYS * ONE_DAY_MS);
	const to = new Date(now.getTime() + 5 * 60 * 1000);

	// 2. Pull transactions
	const txRes = await provider.listTransactions(account, { from, to });
	if (!txRes.ok) {
		await db
			.update(bank_account)
			.set({ last_sync_error: txRes.error || "Transactions fetch failed" })
			.where(eq(bank_account.id, account.id));
		return { ok: false, reason: "transactions-fetch-failed", error: txRes.error };
	}

	let inserted = 0;
	let updated = 0;
	for (const item of txRes.items) {
		const values = {
			venue_id: account.venue_id,
			bank_account_id: account.id,
			external_id: item.external_id,
			direction: item.direction,
			amount_minor: item.amount_minor,
			currency: item.currency,
			counterparty_name: item.counterparty_name,
			counterparty_account: item.counterparty_account,
			reference: item.reference,
			category_uid: item.category_uid,
			source: account.provider,
			settled_at: item.settled_at,
			transaction_time: item.transaction_time,
			raw_payload: item.raw_payload,
		};
		const result = await db
			.insert(bank_transaction)
			.values(values)
			.onConflictDoUpdate({
				target: [bank_transaction.bank_account_id, bank_transaction.external_id],
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
			.returning({
				id: bank_transaction.id,
				createdAt: bank_transaction.createdAt,
				updatedAt: bank_transaction.updatedAt,
			});
		if (result[0]) {
			if (result[0].createdAt.getTime() === result[0].updatedAt.getTime()) inserted++;
			else updated++;
		}
	}

	// 3. Capture a balance snapshot
	const balance = await provider.fetchBalance(account);
	if (balance.ok) {
		await db.insert(bank_balance_snapshot).values({
			venue_id: account.venue_id,
			bank_account_id: account.id,
			cleared_minor: balance.cleared_minor,
			effective_minor: balance.effective_minor ?? balance.cleared_minor,
			pending_minor: balance.pending_minor ?? 0,
			currency: balance.currency,
			source: account.provider,
			captured_at: now,
		});
	}

	// 4. Optionally derive historic balance snapshots from the transaction
	//    history on a force-sync (initial setup / backfill button).
	let backfilled = 0;
	if (force && balance.ok) {
		backfilled = await backfillBalanceFromTransactions(account.id, account.venue_id, {
			currentClearedMinor: balance.cleared_minor,
			currency: balance.currency,
			today: now,
			daysBack: 360,
		});
	}

	// 5. Update account sync metadata + clear any error
	await db
		.update(bank_account)
		.set({
			last_synced_at: now,
			last_sync_error: null,
		})
		.where(eq(bank_account.id, account.id));

	// 6. Transfer-detect against the venue's other accounts (best-effort)
	await markTransfersForVenue(account.venue_id);

	// 7. Detect outbound transfers to the configured church account.
	await markChurchTransfersForVenue(account.venue_id);

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
 * Sync every active bank account (optionally filtered to a venue). Used by
 * the nightly cron + the "Sync all" admin button.
 */
export async function syncAllBankAccounts({ venueId, force = false } = {}) {
	const accounts = await listActiveBankAccounts(venueId);
	const results = [];
	for (const a of accounts) {
		try {
			const r = await syncBankAccount(a, { force });
			results.push({ bank_account_id: a.id, label: a.label, provider: a.provider, ...r });
		} catch (err) {
			results.push({
				bank_account_id: a.id,
				label: a.label,
				provider: a.provider,
				ok: false,
				error: err?.message || String(err),
			});
		}
	}
	return results;
}

/**
 * Synthesise one balance snapshot per day for the last `daysBack` days from
 * the transaction history. Source-tagged `${provider}-derived` so reruns
 * can wipe + regenerate without touching real cron-captured rows.
 */
async function backfillBalanceFromTransactions(accountId, venueId, {
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
				eq(bank_transaction.bank_account_id, accountId),
				isNotNull(bank_transaction.settled_at),
				gte(bank_transaction.settled_at, windowStart),
			),
		)
		.orderBy(asc(bank_transaction.settled_at));

	const deltaByDay = new Map();
	let totalDeltaInWindow = 0;
	for (const t of txs) {
		const delta = t.direction === "IN" ? t.amount_minor : -t.amount_minor;
		totalDeltaInWindow += delta;
		const k = utcDayKey(new Date(t.settled_at));
		deltaByDay.set(k, (deltaByDay.get(k) ?? 0) + delta);
	}
	const startingBalance = currentClearedMinor - totalDeltaInWindow;

	// Wipe any prior derived rows in the window so reruns don't pile up.
	await db
		.delete(bank_balance_snapshot)
		.where(
			and(
				eq(bank_balance_snapshot.bank_account_id, accountId),
				sql`${bank_balance_snapshot.source} LIKE '%-derived'`,
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
		if (captured >= endOfToday) continue;
		inserts.push({
			venue_id: venueId,
			bank_account_id: accountId,
			cleared_minor: running,
			effective_minor: running,
			pending_minor: 0,
			currency,
			source: "derived",
			captured_at: captured,
		});
	}

	if (inserts.length === 0) return 0;
	for (let i = 0; i < inserts.length; i += 200) {
		await db.insert(bank_balance_snapshot).values(inserts.slice(i, i + 200));
	}
	return inserts.length;
}

/**
 * Best-effort transfer detection: any transaction whose
 * `counterparty_account` matches another active bank_account's
 * `external_account_uid` for the same venue is flagged. Run after each
 * sync so newly-imported transfer pairs get tagged.
 *
 * Cheap, idempotent UPDATE - re-running just rewrites the same rows.
 */
async function markTransfersForVenue(venueId) {
	const accounts = await listActiveBankAccounts(venueId);
	const uids = accounts.map((a) => a.external_account_uid).filter(Boolean);
	const hasStripeBank = accounts.some((a) => a.provider === "stripe");

	if (uids.length >= 2) {
		await db.execute(sql`
			UPDATE bank_transaction
			SET is_transfer = true
			WHERE venue_id = ${venueId}
				AND counterparty_account IS NOT NULL
				AND counterparty_account IN (${sql.join(uids.map((u) => sql`${u}`), sql`, `)})
				AND is_transfer = false
		`);
	}

	// Stripe-as-bank-account: pair Stripe payouts with the bank inbound
	// they later settle into, so we don't double-count card income.
	//   - On the Stripe side, payouts are written with counterparty_account
	//     = "stripe_payout" (see providers/stripe.js mapBalanceTransaction).
	//   - On the receiving real bank, the inbound's counterparty_name
	//     contains "stripe".
	// Both sides get flagged is_transfer so neither hits the in/out totals.
	if (hasStripeBank) {
		await db.execute(sql`
			UPDATE bank_transaction
			SET is_transfer = true
			WHERE venue_id = ${venueId}
				AND is_transfer = false
				AND (
					counterparty_account = 'stripe_payout'
					OR (direction = 'IN' AND LOWER(counterparty_name) LIKE '%stripe%')
				)
		`);
	}
}

/**
 * Flag outbound transactions to the venue's configured church account.
 * Match is OR-ed across counterparty_name (case-insensitive contains),
 * sort_code (exact substring in counterparty_account), and account_number
 * (exact substring). Only the OUT direction qualifies and we never touch
 * rows already flagged as inter-account transfers - those should stay on
 * `is_transfer`.
 *
 * Idempotent: re-running just re-asserts the same rows.
 */
async function markChurchTransfersForVenue(venueId) {
	const settings = await getChurchTransferSettings(venueId);
	const name = (settings?.counterparty_name || "").trim();
	const sortCode = (settings?.sort_code || "").replace(/[-\s]/g, "").trim();
	const accountNumber = (settings?.account_number || "").trim();
	if (!name && !sortCode && !accountNumber) return;

	const conditions = [];
	if (name) conditions.push(sql`LOWER(counterparty_name) LIKE ${`%${name.toLowerCase()}%`}`);
	if (sortCode) conditions.push(sql`REPLACE(REPLACE(counterparty_account, '-', ''), ' ', '') LIKE ${`%${sortCode}%`}`);
	if (accountNumber) conditions.push(sql`counterparty_account LIKE ${`%${accountNumber}%`}`);
	if (conditions.length === 0) return;

	await db.execute(sql`
		UPDATE bank_transaction
		SET is_church_transfer = true
		WHERE venue_id = ${venueId}
			AND direction = 'OUT'
			AND is_transfer = false
			AND is_church_transfer = false
			AND (${sql.join(conditions, sql` OR `)})
	`);
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
