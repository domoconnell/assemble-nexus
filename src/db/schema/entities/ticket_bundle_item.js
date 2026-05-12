import { pgTable, uuid, integer, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { ticket_bundle } from "./ticket_bundle.js";
import { ticket_type } from "./ticket_type.js";

export const ticket_bundle_item = pgTable(
	"ticket_bundle_item",
	{
		bundle_id: uuid("bundle_id").notNull().references(() => ticket_bundle.id, { onDelete: "cascade" }),
		ticket_type_id: uuid("ticket_type_id").notNull().references(() => ticket_type.id, { onDelete: "cascade" }),
		quantity: integer("quantity").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.bundle_id, t.ticket_type_id] })],
);
