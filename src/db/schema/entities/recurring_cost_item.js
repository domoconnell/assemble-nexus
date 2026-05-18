import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

/**
 * A line item within a recurring cost type. Lets the user break "Utilities"
 * into individual streams ("Electric", "Water", "Internet") that each have
 * their own monthly amount + history of changes.
 *
 * The aggregate the rest of the system sees is still per-type: the
 * `getAllMonthlyRecurringAmounts` query sums all items of each type.
 */
export const recurring_cost_item = pgTable(
	"recurring_cost_item",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		type: text("type").notNull(),
		label: text("label").notNull(),
		sort_order: integer("sort_order").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [index("recurring_cost_item_venue_type_idx").on(t.venue_id, t.type)],
);
