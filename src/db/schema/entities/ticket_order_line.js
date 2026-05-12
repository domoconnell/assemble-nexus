import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { ticket_order } from "./ticket_order.js";
import { ticket_type } from "./ticket_type.js";
import { ticket_addon } from "./ticket_addon.js";
import { ticket_bundle } from "./ticket_bundle.js";
import { ticket_discount } from "./ticket_discount.js";

export const TICKET_ORDER_LINE_KINDS = ["ticket", "addon", "bundle", "discount"];

export const ticket_order_line = pgTable(
	"ticket_order_line",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		ticket_order_id: uuid("ticket_order_id").notNull().references(() => ticket_order.id, { onDelete: "cascade" }),

		kind: text("kind").notNull(),

		ticket_type_id: uuid("ticket_type_id").references(() => ticket_type.id, { onDelete: "set null" }),
		addon_id: uuid("addon_id").references(() => ticket_addon.id, { onDelete: "set null" }),
		bundle_id: uuid("bundle_id").references(() => ticket_bundle.id, { onDelete: "set null" }),
		discount_id: uuid("discount_id").references(() => ticket_discount.id, { onDelete: "set null" }),

		parent_line_id: uuid("parent_line_id"),

		name_snapshot: text("name_snapshot"),

		quantity: integer("quantity").default(1).notNull(),
		unit_price_cents: integer("unit_price_cents").default(0).notNull(),
		vat_rate_x100_snapshot: integer("vat_rate_x100_snapshot").default(0).notNull(),
		vat_inclusive_snapshot: boolean("vat_inclusive_snapshot").default(false).notNull(),
		vat_cents: integer("vat_cents").default(0).notNull(),
		line_total_cents: integer("line_total_cents").default(0).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
	},
	(t) => [index("ticket_order_line_order_idx").on(t.ticket_order_id)],
);
