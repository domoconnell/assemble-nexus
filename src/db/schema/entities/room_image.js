import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { room } from "./room.js";
import { file } from "./file.js";

export const room_image = pgTable(
    "room_image",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        room_id: uuid("room_id").notNull().references(() => room.id, { onDelete: "cascade" }),
        file_id: uuid("file_id").notNull().references(() => file.id, { onDelete: "cascade" }),
        title: text("title"),
        kind: text("kind").default("gallery").notNull(),
        sort_order: integer("sort_order").default(0).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (t) => [index("room_image_room_idx").on(t.room_id, t.sort_order)],
);
