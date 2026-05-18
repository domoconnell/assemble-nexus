import { pgTable, uuid, text, integer, timestamp, date, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { recurring_cost_item } from "./recurring_cost_item.js";

export const RECURRING_COST_TYPES = ["utilities", "staff", "mortgage", "mortgage_extra"];

export const recurring_cost_schedule = pgTable(
	"recurring_cost_schedule",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		// Pointer to the line item this amount belongs to. Nullable
		// strictly during the migration window; the backfill makes every
		// pre-existing row point at a "Default" item per (venue, type).
		item_id: uuid("item_id").references(() => recurring_cost_item.id, { onDelete: "cascade" }),
		type: text("type").notNull(),
		effective_from: date("effective_from", { mode: "string" }).notNull(),
		monthly_amount_cents: integer("monthly_amount_cents").notNull(),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
	},
	(t) => [
		index("recurring_cost_schedule_venue_type_from_idx").on(t.venue_id, t.type, t.effective_from),
		index("recurring_cost_schedule_item_from_idx").on(t.item_id, t.effective_from),
	],
);
