import { requireCurrentVenue } from "@/db/queries/venue";
import {
	getAllMonthlyRecurringAmounts,
	listRecurringCostItems,
	listScheduleHistoryForItem,
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
		description: "Headline monthly cost of the core team. Add a line per role if you want to track them individually.",
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

	const [currentAmounts, items] = await Promise.all([
		getAllMonthlyRecurringAmounts(venue.id, monthYmd),
		listRecurringCostItems(venue.id),
	]);

	const histories = await Promise.all(
		items.map((it) => listScheduleHistoryForItem(it.id).then((rows) => [it.id, rows])),
	);
	const historyByItem = new Map(histories);

	const itemsByType = new Map();
	for (const type of RECURRING_COST_TYPES) itemsByType.set(type, []);
	for (const it of items) {
		const list = itemsByType.get(it.type);
		if (list) list.push({ ...it, history: historyByItem.get(it.id) ?? [] });
	}

	const sections = RECURRING_COST_TYPES.map((type) => ({
		type,
		label: TYPE_META[type].label,
		description: TYPE_META[type].description,
		current_total: currentAmounts[type] ?? 0,
		items: itemsByType.get(type) ?? [],
	}));

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-4xl space-y-8">
			<div>
				<h1 className="text-2xl font-semibold">Recurring costs</h1>
				<p className="mt-1 text-sm text-muted-foreground max-w-2xl">
					Fixed monthly costs that feed into the ministry-gift formula. Each
					category can hold multiple line items (e.g. Utilities → Electric +
					Water). The ledger and board pack show only the per-category total;
					this page exposes the breakdown.
				</p>
			</div>
			<RecurringCostsClient sections={sections} />
		</div>
	);
}
