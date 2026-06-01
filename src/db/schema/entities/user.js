import { integer, jsonb } from "drizzle-orm/pg-core";
import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
    id: uuid("id").defaultRandom().primaryKey(),
    first_name: text("first_name").notNull(),
    last_name: text("last_name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    mobile_number: text("mobile_number"),
    level: integer("level").default(1).notNull(),
    // Per-user notification opt-outs. Shape: { [template_key]: boolean }.
    // Missing or `true` = subscribed; explicit `false` = opted out. New
    // staff emails default to subscribed so adding a new notification
    // type doesn't silently leave users off the list.
    email_subscriptions: jsonb("email_subscriptions").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
