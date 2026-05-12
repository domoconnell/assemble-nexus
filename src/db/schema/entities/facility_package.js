import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { room } from "./room.js";
import { facility_category } from "./facility_category.js";
import { facility_package_group } from "./facility_package_group.js";
import { vat_rate } from "./vat_rate.js";

export const facility_package = pgTable(
    "facility_package",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        room_id: uuid("room_id").notNull().references(() => room.id, { onDelete: "cascade" }),
        category_id: uuid("category_id").notNull().references(() => facility_category.id, { onDelete: "restrict" }),
        group_id: uuid("group_id").references(() => facility_package_group.id, { onDelete: "set null" }),
        name: text("name").notNull(),
        summary: text("summary"),
        items: jsonb("items").default([]).notNull(),
        price_cents: integer("price_cents").default(0).notNull(),
        vat_rate_id: uuid("vat_rate_id").references(() => vat_rate.id, { onDelete: "set null" }),
        vat_inclusive: boolean("vat_inclusive").default(false).notNull(),
        quantifiable: boolean("quantifiable").default(false).notNull(),
        sort_order: integer("sort_order").default(0).notNull(),
        is_active: boolean("is_active").default(true).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (t) => [index("facility_package_room_idx").on(t.room_id, t.category_id, t.sort_order)],
);
