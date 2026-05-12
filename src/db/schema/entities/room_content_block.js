import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { room } from "./room.js";

export const BLOCK_TYPES = ["prose", "av_package", "spec_table", "faq", "pricing_table", "cta", "gallery"];

export const BLOCK_SECTIONS = ["about", "facilities"];

export const FACILITY_CATEGORIES = {
    audio_visual: "Audio/Visual",
};

export const room_content_block = pgTable(
    "room_content_block",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        room_id: uuid("room_id").notNull().references(() => room.id, { onDelete: "cascade" }),
        type: text("type").notNull(),
        section: text("section"),
        category: text("category"),
        payload: jsonb("payload").notNull().default({}),
        sort_order: integer("sort_order").default(0).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (t) => [index("room_content_block_room_idx").on(t.room_id, t.section, t.category, t.sort_order)],
);
