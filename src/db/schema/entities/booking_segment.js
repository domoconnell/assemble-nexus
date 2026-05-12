import { pgTable, uuid, text, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { booking } from "./booking.js";
import { room } from "./room.js";
import { booking_type } from "./booking_type.js";
import { capacity_layout } from "./capacity_layout.js";

export const booking_segment = pgTable(
    "booking_segment",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        booking_id: uuid("booking_id").notNull().references(() => booking.id, { onDelete: "cascade" }),
        room_id: uuid("room_id").notNull().references(() => room.id, { onDelete: "restrict" }),
        booking_type_id: uuid("booking_type_id").notNull().references(() => booking_type.id, { onDelete: "restrict" }),
        layout_id: uuid("layout_id").references(() => capacity_layout.id, { onDelete: "set null" }),

        starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
        ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),

        rate_snapshot_kind: text("rate_snapshot_kind").notNull(),
        rate_snapshot_amount_cents: integer("rate_snapshot_amount_cents").notNull(),
        units_x100: integer("units_x100").notNull(),
        vat_rate_snapshot_x100: integer("vat_rate_snapshot_x100").default(0).notNull(),
        vat_inclusive_snapshot: boolean("vat_inclusive_snapshot").default(false).notNull(),
        computed_subtotal_cents: integer("computed_subtotal_cents").default(0).notNull(),
        computed_vat_cents: integer("computed_vat_cents").default(0).notNull(),

        sort_order: integer("sort_order").default(0).notNull(),

        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (t) => [
        index("booking_segment_room_window_idx").on(t.room_id, t.starts_at, t.ends_at),
        index("booking_segment_booking_idx").on(t.booking_id, t.sort_order),
    ],
);
