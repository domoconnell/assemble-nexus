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

	// Income breakdown — bank-matched basis (matches dashboard + banking
	// page exactly). Each row is a chunk of bank IN attributed to a
	// matched entity type. Sum reconciles to pnl.cash_in_net.
	const byType = pnl.cash_in_by_type ?? {};
	const incomeItems = [
		{ label: "Bookings", value: byType.bookings ?? 0 },
		{ label: "Tickets", value: byType.tickets ?? 0 },
		{ label: "Tenancies", value: byType.tenancies ?? 0 },
		{ label: "Manual invoices", value: byType.manual_invoices ?? 0 },
		{
			label: "PSP payouts (Stripe / Square)",
			value: byType.psp_payouts ?? 0,
		},
		{ label: "Other / unmatched", value: byType.unmatched ?? 0 },
		{ label: "Refunds (netted)", value: byType.refunds ?? 0 },
	].filter((it) => it.value !== 0);

	// Pending — money the venue has earned but hasn't received yet
	// (held in PSP awaiting payout) or hasn't collected yet (invoices
	// issued, booking balances outstanding). Surfaced as a second block
	// next to the headline so directors see the full picture.
	const psp_held = pnl.psp_held ?? { total: 0, by_provider: { stripe: 0, square: 0 } };
	const outstanding = pnl.outstanding ?? { tenancy: 0, manual: 0, bookings: 0, total: 0 };
	const pendingItems = [
		{ label: "Tenancy invoices issued", value: outstanding.tenancy },
		{ label: "Manual invoices issued", value: outstanding.manual },
		{ label: "Booking balances outstanding", value: outstanding.bookings },
		{
			label: "Held in Stripe (awaiting payout)",
			value: psp_held.by_provider?.stripe ?? 0,
		},
		{
			label: "Held in Square (awaiting payout)",
			value: psp_held.by_provider?.square ?? 0,
		},
	].filter((it) => it.value !== 0);
	const pendingTotal = outstanding.total + psp_held.total;

	// Recognised income — the cash-in + pending combined ("everything
	// earned in or towards this month"). Plus projected bank balance
	// once everything settles.
	const cashIn = pnl.cash_in_net ?? 0;
	const recognisedIncome = cashIn + pendingTotal;
	const currentBankCleared = bankLatest?.cleared_minor ?? 0;
	const projectedBankBalance = currentBankCleared + pendingTotal;

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
		// New cash-in + pending shape used by the redesigned PDF.
		cashIn,
		pendingItems,
		pendingTotal,
		recognisedIncome,
		projectedBankBalance,
		currentBankCleared,
	};
}
