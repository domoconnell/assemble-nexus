import {
	getMonthlyPnl,
	expensesByCategoryForMonth,
	listManualIncomeForMonth,
	getAvailableToTransferToChurch,
	listMonthlyPnlForRange,
} from "@/db/queries/finance";
import { getTopHirersByBookingRevenue } from "@/db/queries/dashboard";
import { sumPaymentsOwedSplit } from "@/db/queries/bookings";
import { listOutstandingTenancyInvoices } from "@/db/queries/tenancies";
import { getCombinedLatestBalance, listBankBalanceSeries } from "@/db/queries/bank";
import { getVenueById } from "@/db/queries/venue";
import { resolveMonth, monthLabel } from "@/lib/finance/months";

const gbpBoard = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
function gbpForBoardSub(cents) {
	return gbpBoard.format((cents ?? 0) / 100);
}

/**
 * Single point of data gathering for the board pack PDF. Both the GET
 * route (interactive download) and the monthly cron call this so they
 * stay in sync. Returns a plain serialisable object ready to feed into
 * the PDF document component.
 */
export async function gatherBoardPackData({ venueId, ym, venueName }) {
	const month = resolveMonth(ym);
	const venueRecord = await getVenueById(venueId);
	const resolvedVenueName = venueName ?? venueRecord?.name ?? "";
	const venueAddress = Array.isArray(venueRecord?.address_lines)
		? venueRecord.address_lines.filter(Boolean)
		: [];

	const [
		pnl,
		byCategory,
		manualIncome,
		churchAvailable,
		monthlyTrend,
		bankDaily,
		bankLatest,
		topHirers,
		paymentsOwed,
		tenancyOutstanding,
	] = await Promise.all([
		getMonthlyPnl(venueId, {
			ymdFirstOfMonth: month.ymdFirstOfMonth,
			ymdFirstOfNextMonth: month.ymdFirstOfNextMonth,
			monthStartDate: month.monthStartDate,
			monthEndDate: month.monthEndDate,
		}),
		expensesByCategoryForMonth(venueId, month.ymdFirstOfMonth, month.ymdFirstOfNextMonth),
		listManualIncomeForMonth(venueId, month.ymdFirstOfMonth, month.ymdFirstOfNextMonth),
		getAvailableToTransferToChurch(venueId, { upToYm: ym }),
		listMonthlyPnlForRange(venueId, { endYm: ym, monthsBack: 12 }),
		listBankBalanceSeries(venueId, { bucket: "day" }),
		getCombinedLatestBalance(venueId),
		getTopHirersByBookingRevenue(venueId, {
			limit: 3,
			fromDate: month.monthStartDate,
			toDate: month.monthEndDate,
		}),
		sumPaymentsOwedSplit(venueId, month.monthStartDate, month.monthEndDate),
		listOutstandingTenancyInvoices(venueId),
	]);

	// Split tenancy invoices into current-period vs prior so the PDF can
	// show them alongside event-side payments owed.
	const tenancyOwed = {
		this_month: { total: 0, count: 0 },
		previous: { total: 0, count: 0 },
		grand_total: 0,
	};
	for (const inv of tenancyOutstanding) {
		const amount = inv.total_cents ?? 0;
		const bucket = inv.period_ym === ym ? "this_month" : "previous";
		tenancyOwed[bucket].total += amount;
		tenancyOwed[bucket].count += 1;
		tenancyOwed.grand_total += amount;
	}

	const codCategoryBreakdown = byCategory.filter((r) => r.is_cost_of_delivery);
	const codItems = [
		...codCategoryBreakdown.map((row) => ({ label: row.name, value: row.total })),
		pnl.cost_of_delivery_breakdown.pos_cogs > 0
			? { label: "POS cost of goods", value: pnl.cost_of_delivery_breakdown.pos_cogs }
			: null,
		pnl.cost_of_delivery_breakdown.organiser_payouts > 0
			? { label: "Owed to organisers", value: pnl.cost_of_delivery_breakdown.organiser_payouts }
			: null,
	].filter(Boolean);

	// `pnl.income.tenancy` is now the PAID figure (cash basis). The
	// board pack still wants to show the accrued / issued amount as a
	// sub-line when there's a deferral gap.
	const tenancyIssued = pnl.income.tenancy_issued ?? pnl.income.tenancy ?? 0;
	const tenancyPaid = pnl.income.tenancy_paid ?? 0;
	const incomeItems = [
		{ label: "Hire fees", value: pnl.income.bookings },
		{ label: "Ticket fees (net of Stripe)", value: pnl.income.tickets },
		{ label: "Cafe POS", value: pnl.income.pos_net },
		{ label: "Manual income", value: pnl.income.manual },
		{
			label: "Manual invoices (net of VAT)",
			value: pnl.income.manual_invoices ?? 0,
			sub:
				(pnl.income.manual_invoices_vat ?? 0) > 0
					? `${gbpForBoardSub(pnl.income.manual_invoices_vat)} VAT`
					: null,
		},
		{
			// Cash-basis: only counts what landed this month. When the
			// issued figure differs (i.e. a tenant deferred), show the
			// gap as a sub-line so the directors can see it.
			label: "Rental income (tenancies)",
			value: tenancyPaid,
			sub:
				tenancyIssued !== tenancyPaid
					? `${gbpForBoardSub(tenancyIssued)} issued`
					: null,
		},
	].filter((it) => it.value !== 0);

	const buildingItems = [
		{ label: "Utilities", value: pnl.fixed.utilities },
		{ label: "Mortgage", value: pnl.fixed.mortgage },
	];

	return {
		venueName: resolvedVenueName,
		venueAddress,
		ym,
		monthLabel: monthLabel(month.year, month.month1),
		generatedAt: new Date().toISOString(),
		pnl,
		manualIncome,
		churchAvailable,
		monthlyTrend,
		bankDaily,
		bankLatest,
		paymentsOwed,
		tenancyOwed,
		topHirers: topHirers.map((h) => ({
			name: h.name,
			bookings_count: h.bookings_count,
			revenue_cents: h.revenue_cents,
		})),
		incomeItems,
		codItems,
		buildingItems,
		byCategory,
	};
}
