import { pgTable, uuid, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const venue = pgTable("venue", {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    address_lines: jsonb("address_lines"),
    timezone: text("timezone").default("Europe/London").notNull(),
    stripe_account_id: text("stripe_account_id"),
    sendgrid_from_email: text("sendgrid_from_email"),
    branding_payload: jsonb("branding_payload"),
    is_active: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
