import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { booking } from "./booking.js";
import { facility_package } from "./facility_package.js";

export const booking_facility_selection = pgTable(
    "booking_facility_selection",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        booking_id: uuid("booking_id").notNull().references(() => booking.id, { onDelete: "cascade" }),
        facility_package_id: uuid("facility_package_id").notNull().references(() => facility_package.id, { onDelete: "restrict" }),
        quantity: integer("quantity").default(1).notNull(),
        name_snapshot: text("name_snapshot").notNull(),
        price_snapshot_cents: integer("price_snapshot_cents").notNull(),
        vat_rate_snapshot_x100: integer("vat_rate_snapshot_x100").default(0).notNull(),
        vat_inclusive_snapshot: boolean("vat_inclusive_snapshot").default(false).notNull(),
        computed_subtotal_cents: integer("computed_subtotal_cents").default(0).notNull(),
        computed_vat_cents: integer("computed_vat_cents").default(0).notNull(),
        sort_order: integer("sort_order").default(0).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [index("booking_facility_selection_booking_idx").on(t.booking_id, t.sort_order)],
);
