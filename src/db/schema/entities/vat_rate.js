import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

export const vat_rate = pgTable("vat_rate", {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    percent_x100: integer("percent_x100").notNull(),
    effective_from: timestamp("effective_from", { withTimezone: true }),
    effective_to: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
