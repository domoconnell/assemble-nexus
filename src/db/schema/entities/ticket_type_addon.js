import { pgTable, uuid, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { ticket_type } from "./ticket_type.js";
import { ticket_addon } from "./ticket_addon.js";

export const ticket_type_addon = pgTable(
	"ticket_type_addon",
	{
		ticket_type_id: uuid("ticket_type_id").notNull().references(() => ticket_type.id, { onDelete: "cascade" }),
		addon_id: uuid("addon_id").notNull().references(() => ticket_addon.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.ticket_type_id, t.addon_id] })],
);
