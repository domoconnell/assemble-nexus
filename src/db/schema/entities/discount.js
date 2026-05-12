import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

// percent_x100: 1000 = 10%, 2000 = 20%
// applies_to: room_hire (only that for now; future: facilities | both)
export const discount = pgTable(
    "discount",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
        label: text("label").notNull(),
        description: text("description"),
        percent_x100: integer("percent_x100").notNull(),
        applies_to: text("applies_to").default("room_hire").notNull(),
        sort_order: integer("sort_order").default(0).notNull(),
        is_active: boolean("is_active").default(true).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (t) => [index("discount_venue_active_idx").on(t.venue_id, t.is_active)],
);
