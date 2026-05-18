import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { recurring_cost_schedule, RECURRING_COST_TYPES } from "@/db/schema/entities/recurring_cost_schedule.js";
import { expense_category } from "@/db/schema/entities/expense_category.js";
import { expense } from "@/db/schema/entities/expense.js";
import { pos_daily_takings } from "@/db/schema/entities/pos_daily_takings.js";
import { manual_income } from "@/db/schema/entities/manual_income.js";
import { booking } from "@/db/schema/entities/booking.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { event } from "@/db/schema/entities/event.js";
import { recurring_cost_item } from "@/db/schema/entities/recurring_cost_item.js";
import { sumChurchTransfers } from "@/db/queries/bank.js";
import { sumTenancyRentalForMonth } from "@/db/queries/tenancies.js";

export async function listEventsForExpenseLinking(venueId) {
	return db
		.select({
			id: event.id,
			title: event.title,
			starts_at: event.starts_at,
		})
		.from(event)
		.where(and(eq(event.venue_id, venueId), isNull(event.deletedAt)))
		.orderBy(desc(event.starts_at), desc(event.createdAt))
		.limit(200);
}

/* ------------------------------------------------------------------------ */
/* recurring cost schedule                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Return the monthly amount in effect for the given month for a given cost
 * type. Picks the most recent schedule row with effective_from <= the first
 * of the target month. Returns 0 if no row applies yet.
 */
export async function getMonthlyRecurringAmount(venueId, type, ymdFirstOfMonth) {
	const [row] = await db
		.select({ amount: recurring_cost_schedule.monthly_amount_cents })
		.from(recurring_cost_schedule)
		.where(
			and(
				eq(recurring_cost_schedule.venue_id, venueId),
				eq(recurring_cost_schedule.type, type),
				lte(recurring_cost_schedule.effective_from, ymdFirstOfMonth),
			),
		)
		.orderBy(desc(recurring_cost_schedule.effective_from))
		.limit(1);
	return row?.amount ?? 0;
}

export async function getAllMonthlyRecurringAmounts(venueId, ymdFirstOfMonth) {
	// Each item has its own schedule history. The amount for a given
	// month = the most-recent effective_from row per item. The number
	// the rest of the system sees for a type is the SUM across that
	// type's items.
	const rows = await db.execute(sql`
		WITH per_item AS (
			SELECT DISTINCT ON (s.item_id)
				s.item_id,
				i.type,
				s.monthly_amount_cents
			FROM recurring_cost_schedule s
			JOIN recurring_cost_item i ON i.id = s.item_id
			WHERE s.venue_id = ${venueId}
				AND s.effective_from <= ${ymdFirstOfMonth}
				AND i.deleted_at IS NULL
			ORDER BY s.item_id, s.effective_from DESC
		)
		SELECT type, COALESCE(SUM(monthly_amount_cents), 0)::int AS total
		FROM per_item
		GROUP BY type
	`);
	const byType = new Map();
	const list = rows.rows ?? rows;
	for (const r of list) byType.set(r.type, Number(r.total ?? 0));
	const out = {};
	for (const type of RECURRING_COST_TYPES) {
		out[type] = byType.get(type) ?? 0;
	}
	return out;
}

export async function listRecurringCostHistory(venueId, type) {
	return db
		.select()
		.from(recurring_cost_schedule)
		.where(
			and(
				eq(recurring_cost_schedule.venue_id, venueId),
				eq(recurring_cost_schedule.type, type),
			),
		)
		.orderBy(desc(recurring_cost_schedule.effective_from));
}

export async function listAllRecurringCostHistory(venueId) {
	const rows = await db
		.select()
		.from(recurring_cost_schedule)
		.where(eq(recurring_cost_schedule.venue_id, venueId))
		.orderBy(asc(recurring_cost_schedule.type), desc(recurring_cost_schedule.effective_from));
	const byType = new Map();
	for (const type of RECURRING_COST_TYPES) byType.set(type, []);
	for (const r of rows) {
		const list = byType.get(r.type);
		if (list) list.push(r);
	}
	return byType;
}

/* ------------------------------------------------------------------------ */
/* recurring cost items (line items within each type)                       */
/* ------------------------------------------------------------------------ */

export async function listRecurringCostItems(venueId) {
	return db
		.select()
		.from(recurring_cost_item)
		.where(
			and(eq(recurring_cost_item.venue_id, venueId), isNull(recurring_cost_item.deletedAt)),
		)
		.orderBy(asc(recurring_cost_item.type), asc(recurring_cost_item.sort_order), asc(recurring_cost_item.label));
}

export async function insertRecurringCostItem(values) {
	const [row] = await db.insert(recurring_cost_item).values(values).returning();
	return row;
}

export async function updateRecurringCostItem(id, patch) {
	const [row] = await db
		.update(recurring_cost_item)
		.set(patch)
		.where(eq(recurring_cost_item.id, id))
		.returning();
	return row;
}

export async function softDeleteRecurringCostItem(id) {
	await db
		.update(recurring_cost_item)
		.set({ deletedAt: new Date() })
		.where(eq(recurring_cost_item.id, id));
}

export async function listScheduleHistoryForItem(itemId) {
	return db
		.select()
		.from(recurring_cost_schedule)
		.where(eq(recurring_cost_schedule.item_id, itemId))
		.orderBy(desc(recurring_cost_schedule.effective_from));
}

export async function insertScheduleEntry(values) {
	const [row] = await db.insert(recurring_cost_schedule).values(values).returning();
	return row;
}

export async function deleteScheduleEntry(id) {
	await db.delete(recurring_cost_schedule).where(eq(recurring_cost_schedule.id, id));
}

/* ------------------------------------------------------------------------ */
/* expense categories (lazy-seed defaults the first time finance is opened) */
/* ------------------------------------------------------------------------ */

const DEFAULT_EXPENSE_CATEGORIES = [
	{ key: "supplies", name: "Supplies", sort_order: 10 },
	{ key: "cleaning", name: "Cleaning", sort_order: 20 },
	{ key: "maintenance", name: "Maintenance", sort_order: 30 },
	{ key: "marketing", name: "Marketing", sort_order: 40 },
	{ key: "software", name: "Software & subscriptions", sort_order: 50 },
	{ key: "event_consumables", name: "Event consumables", sort_order: 60 },
	{ key: "casual_staff", name: "Casual / event staff", sort_order: 70 },
	{ key: "equipment", name: "Equipment", sort_order: 80 },
	{ key: "insurance", name: "Insurance", sort_order: 90 },
	{ key: "other", name: "Other", sort_order: 999 },
];

export async function ensureDefaultExpenseCategories(venueId) {
	const existing = await db
		.select({ key: expense_category.key })
		.from(expense_category)
		.where(eq(expense_category.venue_id, venueId));
	const have = new Set(existing.map((r) => r.key));
	const missing = DEFAULT_EXPENSE_CATEGORIES.filter((c) => !have.has(c.key));
	if (missing.length === 0) return;
	await db
		.insert(expense_category)
		.values(missing.map((c) => ({ ...c, venue_id: venueId })));
}

export async function listExpenseCategories(venueId) {
	return db
		.select()
		.from(expense_category)
		.where(and(eq(expense_category.venue_id, venueId), isNull(expense_category.deletedAt)))
		.orderBy(asc(expense_category.sort_order), asc(expense_category.name));
}

/* ------------------------------------------------------------------------ */
/* expenses                                                                 */
/* ------------------------------------------------------------------------ */

export async function listExpensesForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth) {
	return db
		.select({
			id: expense.id,
			date: expense.date,
			description: expense.description,
			amount_cents: expense.amount_cents,
			vat_cents: expense.vat_cents,
			supplier_name: expense.supplier_name,
			expense_category_id: expense.expense_category_id,
			category_name: expense_category.name,
			category_is_cost_of_delivery: expense_category.is_cost_of_delivery,
			linked_event_id: expense.linked_event_id,
			linked_booking_id: expense.linked_booking_id,
			attachment_file_id: expense.attachment_file_id,
			notes: expense.notes,
		})
		.from(expense)
		.leftJoin(expense_category, eq(expense_category.id, expense.expense_category_id))
		.where(
			and(
				eq(expense.venue_id, venueId),
				isNull(expense.deletedAt),
				gte(expense.date, ymdFirstOfMonth),
				sql`${expense.date} < ${ymdFirstOfNextMonth}`,
			),
		)
		.orderBy(desc(expense.date), desc(expense.createdAt));
}

export async function listExpensesForEvent(eventId) {
	return db
		.select({
			id: expense.id,
			date: expense.date,
			description: expense.description,
			amount_cents: expense.amount_cents,
			supplier_name: expense.supplier_name,
			category_name: expense_category.name,
		})
		.from(expense)
		.leftJoin(expense_category, eq(expense_category.id, expense.expense_category_id))
		.where(and(eq(expense.linked_event_id, eventId), isNull(expense.deletedAt)))
		.orderBy(desc(expense.date), desc(expense.createdAt));
}

export async function sumExpensesForEvent(eventId) {
	const [r] = await db
		.select({
			total: sql`coalesce(sum(${expense.amount_cents}), 0)`,
			count: sql`count(*)`,
		})
		.from(expense)
		.where(and(eq(expense.linked_event_id, eventId), isNull(expense.deletedAt)));
	return {
		total: Number(r?.total ?? 0),
		count: Number(r?.count ?? 0),
	};
}

export async function expensesByCategoryForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth) {
	// Returns rows grouped by category for the month - used by the director
	// board pack to show the cost-of-delivery breakdown. Uncategorised
	// expenses are rolled up under name = "Uncategorised".
	const rows = await db.execute(sql`
		select
			coalesce(c.name, 'Uncategorised') as name,
			coalesce(c.is_cost_of_delivery, true) as is_cost_of_delivery,
			coalesce(sum(e.amount_cents), 0)::bigint as total,
			count(e.id)::int as count
		from ${expense} e
		left join ${expense_category} c on c.id = e.expense_category_id
		where e.venue_id = ${venueId}
		  and e.deleted_at is null
		  and e.date >= ${ymdFirstOfMonth}
		  and e.date < ${ymdFirstOfNextMonth}
		group by c.name, c.is_cost_of_delivery
		order by total desc
	`);
	const list = rows.rows ?? rows;
	return list.map((r) => ({
		name: r.name,
		is_cost_of_delivery: !!r.is_cost_of_delivery,
		total: Number(r.total ?? 0),
		count: Number(r.count ?? 0),
	}));
}

export async function sumExpensesForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth) {
	const [r] = await db
		.select({ total: sql`coalesce(sum(${expense.amount_cents}), 0)` })
		.from(expense)
		.leftJoin(expense_category, eq(expense_category.id, expense.expense_category_id))
		.where(
			and(
				eq(expense.venue_id, venueId),
				isNull(expense.deletedAt),
				gte(expense.date, ymdFirstOfMonth),
				sql`${expense.date} < ${ymdFirstOfNextMonth}`,
				sql`coalesce(${expense_category.is_cost_of_delivery}, true) = true`,
			),
		);
	return Number(r?.total ?? 0);
}

/* ------------------------------------------------------------------------ */
/* POS daily takings                                                        */
/* ------------------------------------------------------------------------ */

export async function listPosTakingsForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth) {
	return db
		.select()
		.from(pos_daily_takings)
		.where(
			and(
				eq(pos_daily_takings.venue_id, venueId),
				gte(pos_daily_takings.date, ymdFirstOfMonth),
				sql`${pos_daily_takings.date} < ${ymdFirstOfNextMonth}`,
			),
		)
		.orderBy(asc(pos_daily_takings.date));
}

export async function upsertPosDailyTakings(venueId, day) {
	// Upsert a single day's row. Re-running the sync for the same date safely
	// overwrites previous values.
	const existing = await db
		.select({ id: pos_daily_takings.id })
		.from(pos_daily_takings)
		.where(
			and(
				eq(pos_daily_takings.venue_id, venueId),
				eq(pos_daily_takings.date, day.date),
			),
		)
		.limit(1);
	if (existing.length) {
		await db
			.update(pos_daily_takings)
			.set({
				gross_cents: day.gross_cents,
				net_cents: day.net_cents,
				vat_cents: day.vat_cents,
				cogs_cents: day.cogs_cents,
				transactions_count: day.transactions_count,
				category_breakdown: day.category_breakdown,
				source: day.source || "square_api",
				synced_at: new Date(),
			})
			.where(eq(pos_daily_takings.id, existing[0].id));
	} else {
		await db.insert(pos_daily_takings).values({
			venue_id: venueId,
			date: day.date,
			gross_cents: day.gross_cents,
			net_cents: day.net_cents,
			vat_cents: day.vat_cents,
			cogs_cents: day.cogs_cents,
			transactions_count: day.transactions_count,
			category_breakdown: day.category_breakdown,
			source: day.source || "square_api",
			synced_at: new Date(),
		});
	}
}

export async function sumPosForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth) {
	const [r] = await db
		.select({
			net: sql`coalesce(sum(${pos_daily_takings.net_cents}), 0)`,
			cogs: sql`coalesce(sum(${pos_daily_takings.cogs_cents}), 0)`,
		})
		.from(pos_daily_takings)
		.where(
			and(
				eq(pos_daily_takings.venue_id, venueId),
				gte(pos_daily_takings.date, ymdFirstOfMonth),
				sql`${pos_daily_takings.date} < ${ymdFirstOfNextMonth}`,
			),
		);
	return { net: Number(r?.net ?? 0), cogs: Number(r?.cogs ?? 0) };
}

/* ------------------------------------------------------------------------ */
/* manual income                                                            */
/* ------------------------------------------------------------------------ */

export async function listManualIncomeForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth) {
	return db
		.select()
		.from(manual_income)
		.where(
			and(
				eq(manual_income.venue_id, venueId),
				isNull(manual_income.deletedAt),
				gte(manual_income.date, ymdFirstOfMonth),
				sql`${manual_income.date} < ${ymdFirstOfNextMonth}`,
			),
		)
		.orderBy(desc(manual_income.date), desc(manual_income.createdAt));
}

export async function sumManualIncomeForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth) {
	const [r] = await db
		.select({ total: sql`coalesce(sum(${manual_income.amount_cents}), 0)` })
		.from(manual_income)
		.where(
			and(
				eq(manual_income.venue_id, venueId),
				isNull(manual_income.deletedAt),
				gte(manual_income.date, ymdFirstOfMonth),
				sql`${manual_income.date} < ${ymdFirstOfNextMonth}`,
			),
		);
	return Number(r?.total ?? 0);
}

/* ------------------------------------------------------------------------ */
/* booking + ticket income (uses paid_at where available, else created_at)  */
/* ------------------------------------------------------------------------ */

export async function sumBookingIncomeForMonth(venueId, monthStartDate, monthEndDate) {
	// Booking income recognised when each payment lands:
	//   deposit_paid_cents recognised at confirmed_at
	//   balance_paid_cents recognised at balance_paid_at
	const endIso = monthEndDate.toISOString();

	const [deposits] = await db
		.select({ total: sql`coalesce(sum(${booking.deposit_paid_cents}), 0)` })
		.from(booking)
		.where(
			and(
				eq(booking.venue_id, venueId),
				gte(booking.confirmed_at, monthStartDate),
				sql`${booking.confirmed_at} < ${endIso}`,
			),
		);

	const [balances] = await db
		.select({ total: sql`coalesce(sum(${booking.balance_paid_cents}), 0)` })
		.from(booking)
		.where(
			and(
				eq(booking.venue_id, venueId),
				gte(booking.balance_paid_at, monthStartDate),
				sql`${booking.balance_paid_at} < ${endIso}`,
			),
		);

	return Number(deposits?.total ?? 0) + Number(balances?.total ?? 0);
}

/**
 * Gross ticket income for the month - the full `total_cents` of every paid
 * order at this venue. The waterfall view treats this as "money in" and
 * deducts organiser payouts + Stripe fees from it via the cost-of-delivery
 * line below.
 */
export async function sumTicketIncomeForMonth(venueId, monthStartDate, monthEndDate) {
	const endIso = monthEndDate.toISOString();
	const [r] = await db
		.select({
			total: sql`coalesce(sum(${ticket_order.total_cents}), 0)::int`,
		})
		.from(ticket_order)
		.innerJoin(event, eq(event.id, ticket_order.event_id))
		.where(
			and(
				eq(event.venue_id, venueId),
				gte(ticket_order.paid_at, monthStartDate),
				sql`${ticket_order.paid_at} < ${endIso}`,
				sql`${ticket_order.status} in ('paid', 'partially_refunded')`,
				isNull(ticket_order.deletedAt),
			),
		);
	return Number(r?.total ?? 0);
}

/**
 * Money owed to event organisers from paid orders this month. Only counts
 * events with a CRM organiser linked - events without one keep the cash on
 * the venue's books.
 */
export async function sumOrganiserPayoutsForMonth(venueId, monthStartDate, monthEndDate) {
	const endIso = monthEndDate.toISOString();
	const [r] = await db
		.select({
			total: sql`coalesce(sum(${ticket_order.organiser_net_cents}), 0)::int`,
		})
		.from(ticket_order)
		.innerJoin(event, eq(event.id, ticket_order.event_id))
		.where(
			and(
				eq(event.venue_id, venueId),
				sql`${event.organiser_organisation_id} is not null`,
				gte(ticket_order.paid_at, monthStartDate),
				sql`${ticket_order.paid_at} < ${endIso}`,
				sql`${ticket_order.status} in ('paid', 'partially_refunded')`,
				isNull(ticket_order.deletedAt),
			),
		);
	return Number(r?.total ?? 0);
}

/**
 * Stripe processing fees on paid orders this month. Uses
 * `stripe_fee_actual_cents` when known (set by the webhook once that's
 * wired) and the estimate otherwise.
 */
export async function sumStripeFeesForMonth(venueId, monthStartDate, monthEndDate) {
	const endIso = monthEndDate.toISOString();
	const [r] = await db
		.select({
			total: sql`coalesce(sum(coalesce(${ticket_order.stripe_fee_actual_cents}, ${ticket_order.stripe_fee_estimate_cents}, 0)), 0)::int`,
		})
		.from(ticket_order)
		.innerJoin(event, eq(event.id, ticket_order.event_id))
		.where(
			and(
				eq(event.venue_id, venueId),
				gte(ticket_order.paid_at, monthStartDate),
				sql`${ticket_order.paid_at} < ${endIso}`,
				sql`${ticket_order.status} in ('paid', 'partially_refunded')`,
				isNull(ticket_order.deletedAt),
			),
		);
	return Number(r?.total ?? 0);
}

/* ------------------------------------------------------------------------ */
/* monthly P&L roll-up - drives the dashboard                               */
/* ------------------------------------------------------------------------ */

/**
 * `ymdFirstOfMonth` and `ymdFirstOfNextMonth` are 'YYYY-MM-DD' strings -
 * the inclusive lower bound and exclusive upper bound of the target month.
 * `monthStartDate` / `monthEndDate` are JS Date instances for the same
 * boundaries (used against timestamptz columns).
 */
/**
 * Roll-up of monthly P&L for the last `monthsBack` months ending at `endYm`
 * (inclusive). Returns an array oldest-first, each row matching
 * `getMonthlyPnl`'s shape plus a `ym` identifier so the dashboard chart can
 * key by month.
 *
 * Currently iterates per-month - fine for the 12-month dashboard window.
 */
export async function listMonthlyPnlForRange(venueId, { endYm, monthsBack = 12 } = {}) {
	const [endYear, endMonth] = endYm.split("-").map(Number);
	const months = [];
	let year = endYear;
	let month1 = endMonth;
	for (let i = 0; i < monthsBack; i++) {
		months.unshift({ year, month1, ym: `${year}-${String(month1).padStart(2, "0")}` });
		if (month1 === 1) {
			month1 = 12;
			year -= 1;
		} else {
			month1 -= 1;
		}
	}
	const results = [];
	for (const m of months) {
		const next =
			m.month1 === 12
				? { year: m.year + 1, month1: 1 }
				: { year: m.year, month1: m.month1 + 1 };
		const ymdStart = `${m.year}-${String(m.month1).padStart(2, "0")}-01`;
		const ymdEnd = `${next.year}-${String(next.month1).padStart(2, "0")}-01`;
		const pnl = await getMonthlyPnl(venueId, {
			ymdFirstOfMonth: ymdStart,
			ymdFirstOfNextMonth: ymdEnd,
			monthStartDate: new Date(`${ymdStart}T00:00:00Z`),
			monthEndDate: new Date(`${ymdEnd}T00:00:00Z`),
		});
		results.push({ ym: m.ym, year: m.year, month1: m.month1, ...pnl });
	}
	return results;
}

/**
 * Earliest month with any P&L footprint - any of: a recurring cost
 * schedule effective_from, an expense, a manual income, a paid booking,
 * a paid ticket order, or a POS day. Returns null if nothing yet, in
 * which case the cumulative roll-up just covers the current month.
 *
 * Returned as 'YYYY-MM-01'.
 */
async function getEarliestPnlMonth(venueId) {
	const res = await db.execute(sql`
		SELECT MIN(d)::date AS earliest FROM (
			SELECT effective_from AS d FROM recurring_cost_schedule
				WHERE venue_id = ${venueId}
			UNION ALL
			SELECT date AS d FROM expense
				WHERE venue_id = ${venueId} AND deleted_at IS NULL
			UNION ALL
			SELECT date AS d FROM manual_income
				WHERE venue_id = ${venueId} AND deleted_at IS NULL
			UNION ALL
			SELECT date AS d FROM pos_daily_takings
				WHERE venue_id = ${venueId}
			UNION ALL
			SELECT confirmed_at::date AS d FROM booking
				WHERE venue_id = ${venueId} AND confirmed_at IS NOT NULL
			UNION ALL
			SELECT (ticket_order.paid_at)::date AS d
				FROM ticket_order
				JOIN event ON event.id = ticket_order.event_id
				WHERE event.venue_id = ${venueId}
					AND ticket_order.paid_at IS NOT NULL
					AND ticket_order.deleted_at IS NULL
		) AS all_dates
	`);
	const list = res.rows ?? res;
	const earliest = list[0]?.earliest;
	if (!earliest) return null;
	const d = new Date(earliest);
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Cumulative "available for church transfer" since the venue started
 * tracking, minus the total church transfers settled to date. This is the
 * headline "Available to transfer to church" number on the ledger
 * overview - sums every month's (income - cost_of_delivery - staff) and
 * deducts the bank-side transfers that have actually moved.
 */
export async function getAvailableToTransferToChurch(venueId, { upToYm } = {}) {
	const endYmDefault = (() => {
		const now = new Date();
		return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
	})();
	const endYm = upToYm ?? endYmDefault;

	const earliest = await getEarliestPnlMonth(venueId);
	if (!earliest) {
		const transferred = await sumChurchTransfers(venueId);
		return {
			cumulative_available: 0,
			transferred_to_church: transferred,
			available_to_transfer: -transferred,
			month_count: 0,
		};
	}
	const [startY, startM] = earliest.slice(0, 7).split("-").map(Number);
	const [endY, endM] = endYm.split("-").map(Number);
	const monthCount = (endY - startY) * 12 + (endM - startM) + 1;
	if (monthCount <= 0) {
		const transferred = await sumChurchTransfers(venueId);
		return {
			cumulative_available: 0,
			transferred_to_church: transferred,
			available_to_transfer: -transferred,
			month_count: 0,
		};
	}

	const months = await listMonthlyPnlForRange(venueId, { endYm, monthsBack: monthCount });
	let cumulative = 0;
	for (const m of months) cumulative += m.building_net ?? 0;

	const transferred = await sumChurchTransfers(venueId);
	return {
		cumulative_available: cumulative,
		transferred_to_church: transferred,
		available_to_transfer: cumulative - transferred,
		month_count: months.length,
	};
}

export async function getMonthlyPnl(venueId, {
	ymdFirstOfMonth,
	ymdFirstOfNextMonth,
	monthStartDate,
	monthEndDate,
}) {
	const periodYm = ymdFirstOfMonth.slice(0, 7);
	const [
		ticket_income,
		booking_income,
		pos,
		manual,
		tenancy_rental,
		expenses_delivery,
		recurring,
		organiser_payouts,
		stripe_fees,
	] = await Promise.all([
		sumTicketIncomeForMonth(venueId, monthStartDate, monthEndDate),
		sumBookingIncomeForMonth(venueId, monthStartDate, monthEndDate),
		sumPosForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth),
		sumManualIncomeForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth),
		sumTenancyRentalForMonth(venueId, monthStartDate, monthEndDate, periodYm),
		sumExpensesForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth),
		getAllMonthlyRecurringAmounts(venueId, ymdFirstOfMonth),
		sumOrganiserPayoutsForMonth(venueId, monthStartDate, monthEndDate),
		sumStripeFeesForMonth(venueId, monthStartDate, monthEndDate),
	]);

	// Stripe takes its processing fee at the source - we net it out of
	// ticket income here rather than treating it as a separate "cost of
	// delivery" line, so the displayed income figure reflects what the
	// venue actually keeps.
	const tickets_net_of_stripe = ticket_income - stripe_fees;
	// Tenancy rental: headline number is the *issued* total for the month
	// (accrual basis) - that's what was agreed/billed and what the
	// dashboard surfaces as the rental income. `tenancy_paid` is exposed
	// alongside so the UI can show "£2,400 issued (£1,800 paid)" without
	// distorting the waterfall maths. Recurring monthly invoices are
	// generally already paid via Direct Debit by month-end so the two
	// numbers will usually match - the split matters mid-month and when
	// a tenant defers.
	const income = {
		tickets: tickets_net_of_stripe,
		tickets_gross: ticket_income,
		stripe_fees,
		bookings: booking_income,
		pos_net: pos.net,
		manual,
		tenancy: tenancy_rental.issued,
		tenancy_paid: tenancy_rental.paid,
		total:
			tickets_net_of_stripe +
			booking_income +
			pos.net +
			manual +
			tenancy_rental.issued,
	};

	const cost_of_delivery_breakdown = {
		expenses: expenses_delivery,
		pos_cogs: pos.cogs,
		organiser_payouts,
	};
	const cost_of_delivery = expenses_delivery + pos.cogs + organiser_payouts;

	const fixed = {
		utilities: recurring.utilities ?? 0,
		staff: recurring.staff ?? 0,
		mortgage: recurring.mortgage ?? 0,
		mortgage_extra: recurring.mortgage_extra ?? 0,
	};
	const fixed_total = fixed.utilities + fixed.staff + fixed.mortgage + fixed.mortgage_extra;

	// Cost of business: what the business actually pays out of its own
	// account (cost of delivery + staff).
	const cost_of_business = cost_of_delivery + fixed.staff;
	const business_net = income.total - cost_of_business;
	// Cost of building: recurring property bills the church pays directly
	// (utilities + mortgage). Extra mortgage is a separate downstream
	// deduction so it surfaces on the waterfall.
	const cost_of_building = fixed.utilities + fixed.mortgage;
	// Building net: what's transferable to the church after the business
	// has covered its own costs and the building's recurring bills.
	const building_net = business_net - cost_of_building;
	// Ministry net: what's left for ministry after the church has set aside
	// any extra mortgage payments.
	const ministry_net = building_net - fixed.mortgage_extra;
	// Alias - same number as ministry_net; kept for older call sites.
	const ministry_gift = ministry_net;

	return {
		income,
		cost_of_delivery,
		cost_of_delivery_breakdown,
		expenses_delivery,
		pos_cogs: pos.cogs,
		organiser_payouts,
		stripe_fees,
		fixed,
		fixed_total,
		cost_of_business,
		business_net,
		cost_of_building,
		building_net,
		ministry_net,
		ministry_gift,
		// Bookkeeping totals - useful for tooltips and audit:
		ticket_income_gross: ticket_income,
	};
}
