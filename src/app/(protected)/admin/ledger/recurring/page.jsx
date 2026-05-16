import { requireCurrentVenue } from "@/db/queries/venue";
import {
	getAllMonthlyRecurringAmounts,
	listAllRecurringCostHistory,
} from "@/db/queries/finance";
import { RECURRING_COST_TYPES } from "@/db/schema/entities/recurring_cost_schedule";
import { currentMonthLondon, ymdFirstOfMonth } from "@/lib/finance/months";
import RecurringCostsClient from "./client";

export const dynamic = "force-dynamic";

const TYPE_META = {
	utilities: {
		label: "Utilities",
		description: "Gas, electricity, water, internet, telephone - the bills that arrive month after month.",
	},
	staff: {
		label: "Staff",
		description: "Headline monthly cost of the core team (just the total - payroll detail isn't tracked here).",
	},
	mortgage: {
		label: "Mortgage",
		description: "Minimum monthly mortgage payment for the venue.",
	},
	mortgage_extra: {
		label: "Extra mortgage payments",
		description: "Additional principal paid down on top of the minimum, when surplus allows.",
	},
};

export default async function RecurringCostsPage() {
	const venue = await requireCurrentVenue();
	const { year, month1 } = currentMonthLondon();
	const monthYmd = ymdFirstOfMonth(year, month1);

	const [currentAmounts, historiesByType] = await Promise.all([
		getAllMonthlyRecurringAmounts(venue.id, monthYmd),
		listAllRecurringCostHistory(venue.id),
	]);

	const sections = RECURRING_COST_TYPES.map((type) => ({
		type,
		label: TYPE_META[type].label,
		description: TYPE_META[type].description,
		current: currentAmounts[type] ?? 0,
		history: historiesByType.get(type) ?? [],
	}));

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-4xl space-y-8">
			<div>
				<h1 className="text-2xl font-semibold">Recurring costs</h1>
				<p className="mt-1 text-sm text-muted-foreground max-w-2xl">
					Fixed monthly costs that feed into the ministry-gift formula. Edits apply
					from the month you choose forwards - the old amount stays on file for
					previous months.
				</p>
			</div>
			<RecurringCostsClient sections={sections} />
		</div>
	);
}
