import { requireCurrentVenue } from "@/db/queries/venue";
import {
	ensureDefaultExpenseCategories,
	listExpenseCategories,
	listExpensesForMonth,
	listEventsForExpenseLinking,
} from "@/db/queries/finance";
import {
	currentMonthLondon,
	resolveMonth,
	monthLabel,
} from "@/lib/finance/months";
import ExpensesClient from "./client";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({ searchParams }) {
	const venue = await requireCurrentVenue();
	await ensureDefaultExpenseCategories(venue.id);

	const sp = await searchParams;
	const requested = typeof sp?.month === "string" ? sp.month : null;
	const fallback = currentMonthLondon();
	const ym = /^\d{4}-\d{2}$/.test(requested ?? "") ? requested : fallback.ym;
	const month = resolveMonth(ym);

	const [categories, expenses, events] = await Promise.all([
		listExpenseCategories(venue.id),
		listExpensesForMonth(venue.id, month.ymdFirstOfMonth, month.ymdFirstOfNextMonth),
		listEventsForExpenseLinking(venue.id),
	]);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Expenses</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Operational costs for {monthLabel(month.year, month.month1)}. These count toward "cost of delivery" in the ministry-gift formula.
				</p>
			</div>
			<ExpensesClient
				ym={ym}
				monthLabel={monthLabel(month.year, month.month1)}
				categories={categories}
				expenses={expenses}
				events={events}
			/>
		</div>
	);
}
