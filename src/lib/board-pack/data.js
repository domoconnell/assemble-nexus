import {
	getMonthlyPnl,
	expensesByCategoryForMonth,
	listManualIncomeForMonth,
	getAvailableToTransferToChurch,
	listMonthlyPnlForRange,
} from "@/db/queries/finance";
import { getTopHirersByBookingRevenue } from "@/db/queries/dashboard";
import { sumPaymentsOwedSplit } from "@/db/queries/bookings";
import { getCombinedLatestBalance, listBankBalanceSeries } from "@/db/queries/bank";
import { resolveMonth, monthLabel } from "@/lib/finance/months";

/**
 * Single point of data gathering for the board pack PDF. Both the GET
 * route (interactive download) and the monthly cron call this so they
 * stay in sync. Returns a plain serialisable object ready to feed into
 * the PDF document component.
 */
export async function gatherBoardPackData({ venueId, ym, venueName = "The Assembly Rooms" }) {
	const month = resolveMonth(ym);

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
	]);

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

	const incomeItems = [
		{ label: "Hire fees", value: pnl.income.bookings },
		{ label: "Ticket fees (net of Stripe)", value: pnl.income.tickets },
		{ label: "Cafe POS", value: pnl.income.pos_net },
		{ label: "Manual income", value: pnl.income.manual },
	].filter((it) => it.value !== 0);

	const buildingItems = [
		{ label: "Utilities", value: pnl.fixed.utilities },
		{ label: "Mortgage", value: pnl.fixed.mortgage },
	];

	return {
		venueName,
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
