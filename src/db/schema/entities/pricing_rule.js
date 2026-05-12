import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { room } from "./room.js";
import { booking_type } from "./booking_type.js";
import { vat_rate } from "./vat_rate.js";

export const RATE_KINDS = ["hourly", "day", "flat"];

export const pricing_rule = pgTable(
    "pricing_rule",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
        room_id: uuid("room_id").references(() => room.id, { onDelete: "cascade" }),
        booking_type_id: uuid("booking_type_id").notNull().references(() => booking_type.id, { onDelete: "cascade" }),
        rate_kind: text("rate_kind").notNull(),
        amount_cents: integer("amount_cents").notNull(),
        daily_cap_cents: integer("daily_cap_cents"),
        vat_rate_id: uuid("vat_rate_id").references(() => vat_rate.id, { onDelete: "set null" }),
        vat_inclusive: boolean("vat_inclusive").default(false).notNull(),
        min_hours: integer("min_hours"),
        min_days: integer("min_days"),
        applies_from: timestamp("applies_from", { withTimezone: true }),
        applies_to: timestamp("applies_to", { withTimezone: true }),
        notes: text("notes"),
        sort_order: integer("sort_order").default(0).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (t) => [
        index("pricing_rule_venue_room_type_idx").on(t.venue_id, t.room_id, t.booking_type_id),
    ],
);
