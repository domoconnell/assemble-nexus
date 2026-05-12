import { pgTable, uuid, integer, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { room } from "./room.js";
import { booking_type } from "./booking_type.js";

export const room_booking_type = pgTable(
    "room_booking_type",
    {
        room_id: uuid("room_id").notNull().references(() => room.id, { onDelete: "cascade" }),
        booking_type_id: uuid("booking_type_id").notNull().references(() => booking_type.id, { onDelete: "cascade" }),
        sort_order: integer("sort_order").default(0).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [primaryKey({ columns: [t.room_id, t.booking_type_id] })],
);
