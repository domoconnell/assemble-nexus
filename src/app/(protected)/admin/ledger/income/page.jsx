import { requireCurrentVenue } from "@/db/queries/venue";
import { listManualIncomeForMonth } from "@/db/queries/finance";
import { currentMonthLondon, resolveMonth, monthLabel } from "@/lib/finance/months";
import ManualIncomeClient from "./client";

export const dynamic = "force-dynamic";

export default async function ManualIncomePage({ searchParams }) {
	const venue = await requireCurrentVenue();
	const sp = await searchParams;
	const requested = typeof sp?.month === "string" ? sp.month : null;
	const fallback = currentMonthLondon();
	const ym = /^\d{4}-\d{2}$/.test(requested ?? "") ? requested : fallback.ym;
	const month = resolveMonth(ym);

	const items = await listManualIncomeForMonth(
		venue.id,
		month.ymdFirstOfMonth,
		month.ymdFirstOfNextMonth,
	);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-4xl space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Manual income</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Donations and ad-hoc receipts that don't come through bookings, tickets, or the POS — {monthLabel(month.year, month.month1)}.
				</p>
			</div>
			<ManualIncomeClient
				ym={ym}
				monthLabel={monthLabel(month.year, month.month1)}
				items={items}
			/>
		</div>
	);
}
