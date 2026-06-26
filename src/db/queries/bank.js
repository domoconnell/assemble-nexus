import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { bank_account } from "@/db/schema/entities/bank_account.js";
import { bank_transaction } from "@/db/schema/entities/bank_transaction.js";
import { bank_balance_snapshot } from "@/db/schema/entities/bank_balance_snapshot.js";
import { tenancy_invoice } from "@/db/schema/entities/tenancy.js";
import { manual_invoice } from "@/db/schema/entities/manual_invoice.js";
import { expense } from "@/db/schema/entities/expense.js";
import { expense_category } from "@/db/schema/entities/expense_category.js";
import { recurring_cost_item } from "@/db/schema/entities/recurring_cost_item.js";
import { booking_payment } from "@/db/schema/entities/booking_payment.js";
import { booking } from "@/db/schema/entities/booking.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";

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
 * subset. Returned as an array - `combineLatestSnapshots` sums them when
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
 * Sum of the latest balances sitting in PSP holding accounts (Stripe +
 * Square). These are "money the venue has earned but hasn't received
 * yet" — they live in the PSP account until the next automatic payout
 * to the operating bank. Surfaced on the dashboard as a separate card
 * so the headline "actual income" isn't lying by omission about money
 * already collected from customers.
 *
 * Returns the sum in minor units, plus a per-provider breakdown.
 */
export async function getPspHeldBalance(venueId) {
	const rows = await db.execute(sql`
		SELECT DISTINCT ON (s.bank_account_id)
			a.provider,
			s.cleared_minor
		FROM bank_balance_snapshot s
		INNER JOIN bank_account a ON a.id = s.bank_account_id
		WHERE s.venue_id = ${venueId}
			AND a.provider IN ('stripe', 'square')
			AND a.deleted_at IS NULL
			AND a.is_active = true
		ORDER BY s.bank_account_id, s.captured_at DESC
	`);
	const list = rows.rows ?? rows;
	let total = 0;
	const by_provider = { stripe: 0, square: 0 };
	for (const r of list) {
		const cents = Number(r.cleared_minor) || 0;
		total += cents;
		if (by_provider[r.provider] != null) by_provider[r.provider] += cents;
	}
	return { total, by_provider };
}

/**
 * Sum of the latest snapshots across (filtered) accounts - the combined
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
 * `is_transfer` rows and `is_church_transfer` rows so the figure reflects
 * external money movement only (and not the church transfer, which is its
 * own line on the ledger).
 */
export async function getBankInOutBetween(venueId, fromDate, toDate, { accountIds } = {}) {
	const filter = accountFilter(accountIds);
	// Period is keyed off the customer-facing transaction date
	// (`transaction_time`, falling back to `settled_at`) — Monzo's
	// next-batch settlement timing can otherwise roll a 31st-of-the-
	// month evening payment into the wrong month, which doesn't match
	// the user's mental model when they reconcile against their statement.
	const fromIso = fromDate.toISOString();
	const toIso = toDate.toISOString();
	const rows = await db
		.select({
			direction: bank_transaction.direction,
			total: sql`COALESCE(SUM(${bank_transaction.amount_minor}), 0)::bigint`.as("total"),
		})
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.venue_id, venueId),
				eq(bank_transaction.is_transfer, false),
				eq(bank_transaction.is_church_transfer, false),
				sql`COALESCE(${bank_transaction.transaction_time}, ${bank_transaction.settled_at}) >= ${fromIso}`,
				sql`COALESCE(${bank_transaction.transaction_time}, ${bank_transaction.settled_at}) < ${toIso}`,
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
 * Inbound bank transactions for a venue that haven't been matched to
 * anything yet (matched_to_id is NULL). Used by the tenancy-invoice
 * "Reconcile" dialog so admins can pick the bank line that paid the
 * invoice. Newest-first, capped at `limit`.
 */
export async function listUnmatchedInboundTransactions(venueId, { limit = 50 } = {}) {
	return db
		.select()
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.venue_id, venueId),
				eq(bank_transaction.direction, "IN"),
				eq(bank_transaction.is_transfer, false),
				eq(bank_transaction.is_church_transfer, false),
				isNull(bank_transaction.matched_to_id),
			),
		)
		.orderBy(
			desc(sql`COALESCE(${bank_transaction.transaction_time}, ${bank_transaction.settled_at})`),
		)
		.limit(limit);
}

/**
 * Persist the match link from a bank transaction to some other entity
 * (currently used for `tenancy_invoice`, but the columns are typed broadly
 * enough that bookings / ticket orders could share the same plumbing).
 */
export async function setBankTransactionMatch(transactionId, { matchedToId, matchedToType }) {
	const [row] = await db
		.update(bank_transaction)
		.set({ matched_to_id: matchedToId, matched_to_type: matchedToType })
		.where(eq(bank_transaction.id, transactionId))
		.returning();
	return row;
}

/**
 * Reverse a reconciliation by clearing the match columns. The bank row
 * stays — only the link is removed.
 */
export async function clearBankTransactionMatch(transactionId) {
	const [row] = await db
		.update(bank_transaction)
		.set({ matched_to_id: null, matched_to_type: null })
		.where(eq(bank_transaction.id, transactionId))
		.returning();
	return row;
}

export async function getBankTransactionMatchedTo(matchedToId, matchedToType) {
	const [row] = await db
		.select()
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.matched_to_id, matchedToId),
				eq(bank_transaction.matched_to_type, matchedToType),
			),
		)
		.limit(1);
	return row ?? null;
}

/**
 * Paginated transaction list, newest first by settled_at (falls back to
 * transaction_time for items that haven't settled).
 */
export async function listBankTransactions(
	venueId,
	{
		limit = 50,
		offset = 0,
		accountIds,
		showPspIncome = false,
		matchedRecurringItemId = null,
		periodStartIso = null,
		periodEndIso = null,
	} = {},
) {
	const filter = accountFilter(accountIds);
	// Hide individual incoming Stripe / Square card charges (and their
	// synthetic processing-fee siblings) by default — café swipes and
	// per-event ticket purchases would otherwise drown out the rest of
	// the ledger. Transfers out of the PSPs to Monzo are direction=OUT
	// so they're unaffected here, as are matched / non-PSP transactions.
	const pspNoiseFilter = showPspIncome
		? null
		: sql`NOT (${bank_transaction.source} IN ('stripe','square') AND (
			(${bank_transaction.direction} = 'IN' AND COALESCE(${bank_transaction.category_uid}, '') NOT IN ('payout','transfer'))
			OR COALESCE(${bank_transaction.category_uid}, '') IN ('stripe_fee','square_fee')
		))`;
	const conditions = [eq(bank_transaction.venue_id, venueId)];
	if (filter) conditions.push(filter);
	if (pspNoiseFilter) conditions.push(pspNoiseFilter);
	// Recurring-cost drill-down: scope to the rows linked to a specific
	// recurring_cost_item within a month window. Used by the click-through
	// from the recurring page's "actual this month" figure.
	if (matchedRecurringItemId) {
		conditions.push(eq(bank_transaction.matched_to_type, "recurring_cost_item"));
		conditions.push(eq(bank_transaction.matched_to_id, matchedRecurringItemId));
	}
	if (periodStartIso) {
		conditions.push(
			sql`COALESCE(${bank_transaction.transaction_time}, ${bank_transaction.settled_at}) >= ${periodStartIso}::timestamptz`,
		);
	}
	if (periodEndIso) {
		conditions.push(
			sql`COALESCE(${bank_transaction.transaction_time}, ${bank_transaction.settled_at}) < ${periodEndIso}::timestamptz`,
		);
	}
	const where = and(...conditions);
	const [rows, [{ count }]] = await Promise.all([
		db
			.select({
				// Spread the row…
				id: bank_transaction.id,
				venue_id: bank_transaction.venue_id,
				bank_account_id: bank_transaction.bank_account_id,
				external_id: bank_transaction.external_id,
				direction: bank_transaction.direction,
				amount_minor: bank_transaction.amount_minor,
				currency: bank_transaction.currency,
				counterparty_name: bank_transaction.counterparty_name,
				counterparty_account: bank_transaction.counterparty_account,
				reference: bank_transaction.reference,
				category_uid: bank_transaction.category_uid,
				source: bank_transaction.source,
				is_transfer: bank_transaction.is_transfer,
				is_church_transfer: bank_transaction.is_church_transfer,
				settled_at: bank_transaction.settled_at,
				transaction_time: bank_transaction.transaction_time,
				matched_to_id: bank_transaction.matched_to_id,
				matched_to_type: bank_transaction.matched_to_type,
				// …plus the matched invoice ref when there is one. The
				// LEFT JOIN is keyed on type='tenancy_invoice' so a future
				// match against another entity won't accidentally bind.
				matched_invoice_reference: tenancy_invoice.reference,
				matched_invoice_status: tenancy_invoice.status,
				// Same shape for expense-typed matches: surface the
				// category name + kind so the pill can read "Marketing"
				// or "Refund · Marketing".
				matched_expense_kind: expense.kind,
				matched_expense_category: expense_category.name,
				// Recurring-cost-item matches: surface the type + label so the
				// pill can show "Utilities · Electric".
				matched_recurring_type: recurring_cost_item.type,
				matched_recurring_label: recurring_cost_item.label,
				// Manual-invoice matches: reference + total so the pill shows
				// "MI-2026-0001" and the click-to-download URL knows which
				// PDF to fetch.
				matched_manual_invoice_reference: manual_invoice.reference,
				matched_manual_invoice_id: manual_invoice.id,
				// Booking-payment matches: surface the booking reference +
				// payment label so the pill reads e.g. "BK-2026-0123 · Deposit".
				// `_deleted` flags propagate so the UI can render a "deleted
				// booking" pill instead of pretending the entity still exists.
				matched_booking_payment_label: booking_payment.label,
				matched_booking_payment_deleted: booking_payment.deletedAt,
				matched_booking_reference: booking.reference,
				matched_booking_id: booking.id,
				matched_booking_deleted: booking.deletedAt,
				// Ticket-order matches: surface the order ref so the pill reads
				// the order id; the View link points at the event.
				matched_ticket_order_reference: ticket_order.reference,
				matched_ticket_order_event_id: ticket_order.event_id,
				matched_ticket_order_deleted: ticket_order.deletedAt,
				// Stripe-orphan matches (matched_to_type='stripe_orphan',
				// matched_to_id=null): no entity to join to, so we extract the
				// original BK-/TIX- reference from the stored Stripe metadata
				// blob (`raw_payload.source.metadata.reference`) so the pill
				// can show what the receipt was originally for.
				matched_orphan_reference: sql`${bank_transaction.raw_payload}->'source'->'metadata'->>'reference'`,
			})
			.from(bank_transaction)
			.leftJoin(
				tenancy_invoice,
				and(
					eq(bank_transaction.matched_to_id, tenancy_invoice.id),
					eq(bank_transaction.matched_to_type, "tenancy_invoice"),
				),
			)
			.leftJoin(
				expense,
				and(
					eq(bank_transaction.matched_to_id, expense.id),
					eq(bank_transaction.matched_to_type, "expense"),
				),
			)
			.leftJoin(
				expense_category,
				eq(expense_category.id, expense.expense_category_id),
			)
			.leftJoin(
				recurring_cost_item,
				and(
					eq(bank_transaction.matched_to_id, recurring_cost_item.id),
					eq(bank_transaction.matched_to_type, "recurring_cost_item"),
				),
			)
			.leftJoin(
				manual_invoice,
				and(
					eq(bank_transaction.matched_to_id, manual_invoice.id),
					eq(bank_transaction.matched_to_type, "manual_invoice"),
				),
			)
			.leftJoin(
				booking_payment,
				and(
					eq(bank_transaction.matched_to_id, booking_payment.id),
					eq(bank_transaction.matched_to_type, "booking_payment"),
				),
			)
			.leftJoin(booking, eq(booking.id, booking_payment.booking_id))
			.leftJoin(
				ticket_order,
				and(
					eq(bank_transaction.matched_to_id, ticket_order.id),
					eq(bank_transaction.matched_to_type, "ticket_order"),
				),
			)
			.where(where)
			.orderBy(
				// Sort by when the payment happened, not when it cleared.
				// `settled_at` for Stripe is `available_on` (a few days in
				// the future for pending charges) so using that for ordering
				// puts pending rows out of order from the user's POV.
				desc(sql`COALESCE(${bank_transaction.transaction_time}, ${bank_transaction.settled_at})`),
				// Within the same timestamp, parents come before their
				// synthetic fee rows. external_id of the fee row is
				// "${parent.external_id}#fee" so ASC ordering naturally
				// places the parent first.
				asc(bank_transaction.external_id),
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
 * Sum of all settled church transfers for the venue, optionally bounded.
 * Used by the ledger to compute "available to transfer to church".
 */
export async function sumChurchTransfers(venueId, { fromDate, toDate } = {}) {
	const conditions = [
		eq(bank_transaction.venue_id, venueId),
		eq(bank_transaction.is_church_transfer, true),
	];
	if (fromDate) conditions.push(sql`${bank_transaction.settled_at} >= ${fromDate.toISOString()}`);
	if (toDate) conditions.push(sql`${bank_transaction.settled_at} < ${toDate.toISOString()}`);
	const [r] = await db
		.select({
			total: sql`COALESCE(SUM(${bank_transaction.amount_minor}), 0)::bigint`.as("total"),
		})
		.from(bank_transaction)
		.where(and(...conditions));
	return Number(r?.total ?? 0);
}

/**
 * Recent church-transfer transactions, newest first. Used by the ledger
 * overview to show a small list under "Available to transfer to church".
 */
export async function listRecentChurchTransfers(venueId, { limit = 6 } = {}) {
	return db
		.select()
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.venue_id, venueId),
				eq(bank_transaction.is_church_transfer, true),
			),
		)
		.orderBy(
			desc(sql`COALESCE(${bank_transaction.settled_at}, ${bank_transaction.transaction_time})`),
		)
		.limit(limit);
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
