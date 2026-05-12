import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

// Generic key/value store for venue-scoped settings.
// e.g. key="ticketing", value={ platform_fee_pct_x100, platform_fee_flat_cents }
export const setting = pgTable(
    "setting",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
        key: text("key").notNull(),
        value: jsonb("value").default({}).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    },
    (t) => [uniqueIndex("setting_venue_key_unique").on(t.venue_id, t.key)],
);
