import { pgTable, uuid, text, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { user } from "./user.js";
import { event_organiser } from "./event_organiser.js";

export const user_event_organiser = pgTable(
	"user_event_organiser",
	{
		user_id: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
		event_organiser_id: uuid("event_organiser_id").notNull().references(() => event_organiser.id, { onDelete: "cascade" }),
		// Per-organiser role for future fine-grained access (admin = manage org, member = create events under it).
		// For now we just need the link; default to "member".
		role: text("role").notNull().default("member"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.user_id, t.event_organiser_id] })],
);
