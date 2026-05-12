import { pgTable, uuid, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

// pct_x100: 2500 = 25%, 1000 = 10%
export const deposit_policy = pgTable("deposit_policy", {
    id: uuid("id").defaultRandom().primaryKey(),
    venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
    deposit_pct_x100: integer("deposit_pct_x100").notNull(),
    non_refundable_pct_x100: integer("non_refundable_pct_x100").notNull(),
    refundable_until_days_before: integer("refundable_until_days_before").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    applies_from: timestamp("applies_from", { withTimezone: true }),
    applies_to: timestamp("applies_to", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
