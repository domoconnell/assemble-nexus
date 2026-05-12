import { pgTable, uuid, text, boolean, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

export const expense_category = pgTable(
	"expense_category",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		name: text("name").notNull(),
		// Whether expenses in this category count toward "cost of delivery" in
		// the ministry-gift formula. True by default; flip false for things like
		// capex that shouldn't be deducted from monthly surplus.
		is_cost_of_delivery: boolean("is_cost_of_delivery").default(true).notNull(),
		sort_order: integer("sort_order").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		uniqueIndex("expense_category_venue_key_unique").on(t.venue_id, t.key),
		index("expense_category_venue_idx").on(t.venue_id, t.sort_order),
	],
);
