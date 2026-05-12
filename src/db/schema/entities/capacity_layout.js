import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";

export const capacity_layout = pgTable("capacity_layout", {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    icon: text("icon"),
    sort_order: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
