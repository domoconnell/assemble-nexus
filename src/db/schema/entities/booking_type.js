import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

// rate_modifier_x100: 10000 = 100% (no modifier), 5000 = 50% off, 12500 = +25%
export const booking_type = pgTable("booking_type", {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    description: text("description"),
    default_rate_modifier_x100: integer("default_rate_modifier_x100").default(10000).notNull(),
    sort_order: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
