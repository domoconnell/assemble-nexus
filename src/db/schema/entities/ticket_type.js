import { pgTable, uuid, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { event } from "./event.js";
import { vat_rate } from "./vat_rate.js";

export const ticket_type = pgTable(
	"ticket_type",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		event_id: uuid("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),

		price_cents: integer("price_cents").default(0).notNull(),
		vat_rate_id: uuid("vat_rate_id").references(() => vat_rate.id, { onDelete: "set null" }),
		vat_inclusive: boolean("vat_inclusive").default(false).notNull(),

		admits_count: integer("admits_count").default(1).notNull(),
		max_quantity: integer("max_quantity"),
		per_order_min: integer("per_order_min").default(0).notNull(),
		per_order_max: integer("per_order_max"),

		sale_starts_at: timestamp("sale_starts_at", { withTimezone: true }),
		sale_ends_at: timestamp("sale_ends_at", { withTimezone: true }),

		sort_order: integer("sort_order").default(0).notNull(),
		is_active: boolean("is_active").default(true).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [index("ticket_type_event_idx").on(t.event_id, t.sort_order)],
);
