import { pgTable, uuid, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { event } from "./event.js";

export const ticket_discount = pgTable(
	"ticket_discount",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		event_id: uuid("event_id").references(() => event.id, { onDelete: "cascade" }),

		label: text("label").notNull(),

		trigger: text("trigger").notNull().default("auto"),
		code: text("code"),

		kind: text("kind").notNull(),
		value_x100: integer("value_x100"),
		value_cents: integer("value_cents"),
		n_free: integer("n_free"),

		min_qty: integer("min_qty"),
		max_uses: integer("max_uses"),
		used_count: integer("used_count").default(0).notNull(),

		starts_at: timestamp("starts_at", { withTimezone: true }),
		ends_at: timestamp("ends_at", { withTimezone: true }),

		sort_order: integer("sort_order").default(0).notNull(),
		is_active: boolean("is_active").default(true).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [index("ticket_discount_event_idx").on(t.event_id, t.sort_order)],
);
