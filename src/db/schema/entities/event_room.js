import { pgTable, uuid, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { event } from "./event.js";
import { room } from "./room.js";

export const event_room = pgTable(
	"event_room",
	{
		event_id: uuid("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
		room_id: uuid("room_id").notNull().references(() => room.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.event_id, t.room_id] })],
);
