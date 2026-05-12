import { pgTable, uuid, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { ticket_discount } from "./ticket_discount.js";
import { ticket_type } from "./ticket_type.js";

export const ticket_discount_type = pgTable(
	"ticket_discount_type",
	{
		discount_id: uuid("discount_id").notNull().references(() => ticket_discount.id, { onDelete: "cascade" }),
		ticket_type_id: uuid("ticket_type_id").notNull().references(() => ticket_type.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.discount_id, t.ticket_type_id] })],
);
