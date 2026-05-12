import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { booking } from "./booking.js";
import { user } from "./user.js";

export const booking_status_event = pgTable(
    "booking_status_event",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        booking_id: uuid("booking_id").notNull().references(() => booking.id, { onDelete: "cascade" }),
        from_status: text("from_status"),
        to_status: text("to_status").notNull(),
        actor_user_id: uuid("actor_user_id").references(() => user.id, { onDelete: "set null" }),
        note: text("note"),
        at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [index("booking_status_event_booking_idx").on(t.booking_id, t.at)],
);
