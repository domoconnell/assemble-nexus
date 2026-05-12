import { pgTable, uuid, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { event } from "./event.js";
import { ticket_addon_group } from "./ticket_addon_group.js";
import { vat_rate } from "./vat_rate.js";

export const ticket_addon = pgTable(
	"ticket_addon",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		event_id: uuid("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
		group_id: uuid("group_id").references(() => ticket_addon_group.id, { onDelete: "set null" }),

		name: text("name").notNull(),
		description: text("description"),

		price_cents: integer("price_cents").default(0).notNull(),
		vat_rate_id: uuid("vat_rate_id").references(() => vat_rate.id, { onDelete: "set null" }),
		vat_inclusive: boolean("vat_inclusive").default(false).notNull(),

		max_quantity_per_ticket: integer("max_quantity_per_ticket").default(1).notNull(),

		sort_order: integer("sort_order").default(0).notNull(),
		is_active: boolean("is_active").default(true).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [index("ticket_addon_event_idx").on(t.event_id, t.sort_order)],
);
