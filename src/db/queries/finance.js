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
	// One query returns the most-recent-effective row per type. DISTINCT ON
	// picks the first row of each type group, and we order by
	// effective_from DESC so "first" = most recent.
	const rows = await db.execute(sql`
		select distinct on (type) type, monthly_amount_cents
		from recurring_cost_schedule
		where venue_id = ${venueId} and effective_from <= ${ymdFirstOfMonth}
		order by type, effective_from desc
	`);
	const byType = new Map();
	const list = rows.rows ?? rows;
	for (const r of list) byType.set(r.type, Number(r.monthly_amount_cents ?? 0));
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
	// Returns rows grouped by category for the month — used by the director
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
 * Gross ticket income for the month — the full `total_cents` of every paid
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
 * events with a CRM organiser linked — events without one keep the cash on
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
/* monthly P&L roll-up — drives the dashboard                               */
/* ------------------------------------------------------------------------ */

/**
 * `ymdFirstOfMonth` and `ymdFirstOfNextMonth` are 'YYYY-MM-DD' strings —
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
 * Currently iterates per-month — fine for the 12-month dashboard window.
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

export async function getMonthlyPnl(venueId, {
	ymdFirstOfMonth,
	ymdFirstOfNextMonth,
	monthStartDate,
	monthEndDate,
}) {
	const [
		ticket_income,
		booking_income,
		pos,
		manual,
		expenses_delivery,
		recurring,
		organiser_payouts,
		stripe_fees,
	] = await Promise.all([
		sumTicketIncomeForMonth(venueId, monthStartDate, monthEndDate),
		sumBookingIncomeForMonth(venueId, monthStartDate, monthEndDate),
		sumPosForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth),
		sumManualIncomeForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth),
		sumExpensesForMonth(venueId, ymdFirstOfMonth, ymdFirstOfNextMonth),
		getAllMonthlyRecurringAmounts(venueId, ymdFirstOfMonth),
		sumOrganiserPayoutsForMonth(venueId, monthStartDate, monthEndDate),
		sumStripeFeesForMonth(venueId, monthStartDate, monthEndDate),
	]);

	const income = {
		tickets: ticket_income,
		bookings: booking_income,
		pos_net: pos.net,
		manual,
		total: ticket_income + booking_income + pos.net + manual,
	};

	// Cost of delivery now includes organiser payouts + Stripe fees so the
	// waterfall reads as "money in → minus everything we have to spend to
	// deliver the service → what's left for fixed costs and ministry gift".
	const cost_of_delivery_breakdown = {
		expenses: expenses_delivery,
		pos_cogs: pos.cogs,
		organiser_payouts,
		stripe_fees,
	};
	const cost_of_delivery =
		expenses_delivery + pos.cogs + organiser_payouts + stripe_fees;

	const fixed = {
		utilities: recurring.utilities ?? 0,
		staff: recurring.staff ?? 0,
		mortgage: recurring.mortgage ?? 0,
		mortgage_extra: recurring.mortgage_extra ?? 0,
	};
	const fixed_total = fixed.utilities + fixed.staff + fixed.mortgage + fixed.mortgage_extra;

	const ministry_gift = income.total - cost_of_delivery - fixed_total;

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
		ministry_gift,
	};
}
