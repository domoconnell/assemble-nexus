import { and, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { booking } from "@/db/schema/entities/booking.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { event } from "@/db/schema/entities/event.js";
import { pos_daily_takings } from "@/db/schema/entities/pos_daily_takings.js";
import { expense } from "@/db/schema/entities/expense.js";
import { manual_invoice } from "@/db/schema/entities/manual_invoice.js";
import { manual_income } from "@/db/schema/entities/manual_income.js";
import { tenancy_invoice } from "@/db/schema/entities/tenancy.js";

/**
 * VAT return rollup for a date range. Cash-basis: each output stream is
 * keyed off the natural "money received" timestamp; input VAT keys off
 * the expense's date.
 *
 *   bookings        → confirmed_at  (booking firm, deposit paid)
 *   tickets         → paid_at       (delegate paid)
 *   POS             → date          (each day's takings)
 *   manual invoices → paid_at       (matched against a bank receipt)
 *   tenancy invoices→ paid_at       (matched against a bank receipt)
 *   expenses        → date          (when the expense was incurred)
 *
 * Returns gross/vat/net per output stream plus a totals row, and a
 * separate `inputs` block for the Box 4 side. Net VAT due (Box 5) is
 * output_vat − input_vat.
 */
export async function getVatReturnRollup(venueId, { fromDate, toDate }) {
	const fromIso = fromDate.toISOString();
	const toIso = toDate.toISOString();
	const fromYmd = fromDate.toISOString().slice(0, 10);
	const toYmd = toDate.toISOString().slice(0, 10);

	const [
		[bookingsRow],
		[ticketsRow],
		[posRow],
		[manualIncomeRow],
		[manualInvoicesRow],
		[tenancyInvoicesRow],
		[expensesRow],
	] = await Promise.all([
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
		// Manual income — donations + equipment hire + other ad-hoc
		// receipts. Cash basis on the row's `date` field. Most rows
		// have vat=0 (donations are outside the scope), but VATable
		// rows (equipment hire) carry it.
		db
			.select({
				gross_cents: sql`COALESCE(SUM(${manual_income.amount_cents}), 0)::bigint`.as("gross"),
				vat_cents: sql`COALESCE(SUM(${manual_income.vat_cents}), 0)::bigint`.as("vat"),
				count: sql`COUNT(*)::int`.as("count"),
			})
			.from(manual_income)
			.where(
				and(
					eq(manual_income.venue_id, venueId),
					isNull(manual_income.deletedAt),
					sql`${manual_income.date} >= ${fromYmd}`,
					sql`${manual_income.date} < ${toYmd}`,
				),
			),
		// Manual ad-hoc invoices raised against incoming bank receipts.
		// Cash basis: paid_at is when the bank matched the receipt to
		// the invoice.
		db
			.select({
				gross_cents: sql`COALESCE(SUM(${manual_invoice.total_cents}), 0)::bigint`.as("gross"),
				vat_cents: sql`COALESCE(SUM(${manual_invoice.vat_cents}), 0)::bigint`.as("vat"),
				count: sql`COUNT(*)::int`.as("count"),
			})
			.from(manual_invoice)
			.where(
				and(
					eq(manual_invoice.venue_id, venueId),
					isNull(manual_invoice.deletedAt),
					isNotNull(manual_invoice.paid_at),
					gte(manual_invoice.paid_at, fromDate),
					lt(manual_invoice.paid_at, toDate),
				),
			),
		// Tenancy invoices (monthly rent etc). Cash basis on paid_at.
		// Previously this was on the P&L's accrual basis (period_ym),
		// but VAT has always been cash-basis — keeping the two consistent
		// matters for HMRC.
		db
			.select({
				gross_cents: sql`COALESCE(SUM(${tenancy_invoice.total_cents}), 0)::bigint`.as("gross"),
				vat_cents: sql`COALESCE(SUM(${tenancy_invoice.vat_cents}), 0)::bigint`.as("vat"),
				count: sql`COUNT(*)::int`.as("count"),
			})
			.from(tenancy_invoice)
			.where(
				and(
					eq(tenancy_invoice.venue_id, venueId),
					isNull(tenancy_invoice.deletedAt),
					eq(tenancy_invoice.status, "paid"),
					isNotNull(tenancy_invoice.paid_at),
					gte(tenancy_invoice.paid_at, fromDate),
					lt(tenancy_invoice.paid_at, toDate),
				),
			),
		db
			.select({
				gross_cents: sql`COALESCE(SUM(CASE WHEN ${expense.kind} = 'refund' THEN -${expense.amount_cents} ELSE ${expense.amount_cents} END), 0)::bigint`.as("gross"),
				vat_cents: sql`COALESCE(SUM(CASE WHEN ${expense.kind} = 'refund' THEN -${expense.vat_cents} ELSE ${expense.vat_cents} END), 0)::bigint`.as("vat"),
				count: sql`COUNT(*)::int`.as("count"),
			})
			.from(expense)
			.where(
				and(
					eq(expense.venue_id, venueId),
					isNull(expense.deletedAt),
					sql`${expense.date} >= ${fromYmd}`,
					sql`${expense.date} < ${toYmd}`,
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
		{
			key: "manual_income",
			label: "Manual income (donations, hire, etc)",
			date_basis: "date",
			gross_cents: Number(manualIncomeRow?.gross_cents) || 0,
			vat_cents: Number(manualIncomeRow?.vat_cents) || 0,
			count: Number(manualIncomeRow?.count) || 0,
		},
		{
			key: "manual_invoices",
			label: "Manual invoices",
			date_basis: "paid_at",
			gross_cents: Number(manualInvoicesRow?.gross_cents) || 0,
			vat_cents: Number(manualInvoicesRow?.vat_cents) || 0,
			count: Number(manualInvoicesRow?.count) || 0,
		},
		{
			key: "tenancy_invoices",
			label: "Tenancy invoices",
			date_basis: "paid_at",
			gross_cents: Number(tenancyInvoicesRow?.gross_cents) || 0,
			vat_cents: Number(tenancyInvoicesRow?.vat_cents) || 0,
			count: Number(tenancyInvoicesRow?.count) || 0,
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

	const inputs = {
		key: "expenses",
		label: "Expenses (purchases)",
		date_basis: "date",
		gross_cents: Number(expensesRow?.gross_cents) || 0,
		vat_cents: Number(expensesRow?.vat_cents) || 0,
		count: Number(expensesRow?.count) || 0,
	};
	inputs.net_cents = inputs.gross_cents - inputs.vat_cents;

	// Box 5: VAT due to HMRC = output VAT − input VAT
	const net_vat_due_cents = totals.vat_cents - inputs.vat_cents;

	return {
		from: fromIso,
		to: toIso,
		streams,
		totals,
		inputs,
		net_vat_due_cents,
	};
}
