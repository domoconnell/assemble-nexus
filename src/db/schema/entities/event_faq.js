import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { event } from "./event.js";

export const event_faq = pgTable(
	"event_faq",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		event_id: uuid("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
		question: text("question").notNull(),
		answer: text("answer").notNull(),
		sort_order: integer("sort_order").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [index("event_faq_event_idx").on(t.event_id, t.sort_order)],
);
