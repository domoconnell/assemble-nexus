import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { ticket_order_line } from "./ticket_order_line.js";
import { file } from "./file.js";
import { user } from "./user.js";

export const TICKET_STATUSES = ["valid", "used", "refunded", "void"];

export const ticket = pgTable(
	"ticket",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		ticket_order_line_id: uuid("ticket_order_line_id").notNull().references(() => ticket_order_line.id, { onDelete: "cascade" }),

		code: text("code").notNull().unique(),

		qr_file_id: uuid("qr_file_id").references(() => file.id, { onDelete: "set null" }),
		apple_pass_file_id: uuid("apple_pass_file_id").references(() => file.id, { onDelete: "set null" }),

		holder_name: text("holder_name"),
		status: text("status").notNull().default("valid"),

		used_at: timestamp("used_at", { withTimezone: true }),
		used_by_user_id: uuid("used_by_user_id").references(() => user.id, { onDelete: "set null" }),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
	},
	(t) => [
		index("ticket_code_idx").on(t.code),
		index("ticket_order_line_idx").on(t.ticket_order_line_id),
	],
);
