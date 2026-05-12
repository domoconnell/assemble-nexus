import { pgTable, uuid, integer, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { room } from "./room.js";
import { capacity_layout } from "./capacity_layout.js";

export const room_capacity = pgTable(
    "room_capacity",
    {
        room_id: uuid("room_id").notNull().references(() => room.id, { onDelete: "cascade" }),
        layout_id: uuid("layout_id").notNull().references(() => capacity_layout.id, { onDelete: "cascade" }),
        value: integer("value").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    },
    (t) => [primaryKey({ columns: [t.room_id, t.layout_id] })],
);
