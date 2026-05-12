import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const permission = pgTable("permission", {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
