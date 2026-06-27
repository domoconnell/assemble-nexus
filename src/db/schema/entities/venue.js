import { pgTable, uuid, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const venue = pgTable("venue", {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    address_lines: jsonb("address_lines"),
    timezone: text("timezone").default("Europe/London").notNull(),
    // Public contact details, surfaced in the site footer + contact page.
    phone: text("phone"),
    contact_email: text("contact_email"),
    stripe_account_id: text("stripe_account_id"),
    sendgrid_from_email: text("sendgrid_from_email"),
    branding_payload: jsonb("branding_payload"),
    // Bank account details rendered on every invoice PDF (tenancy,
    // booking, manual). Shape: { bank_name, account_name, sort_code,
    // account_number, iban?, bic? }. Optional fields stay undefined
    // until the venue needs international transfers.
    bank_details: jsonb("bank_details"),
    is_active: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
