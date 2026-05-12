import { pgTable, uuid, text, timestamp, boolean, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { file } from "./file.js";

export const room = pgTable(
    "room",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
        slug: text("slug").notNull(),
        name: text("name").notNull(),
        tagline: text("tagline"),
        short_description: text("short_description"),
        hero_file_id: uuid("hero_file_id").references(() => file.id, { onDelete: "set null" }),
        av_highlight: text("av_highlight"),
        accent_hue: text("accent_hue"),
        allow_ticketed_events: boolean("allow_ticketed_events").default(false).notNull(),
        ticketing_setup_fee_pct_x100: integer("ticketing_setup_fee_pct_x100").default(0).notNull(),
        buffer_minutes: integer("buffer_minutes").default(60).notNull(),
        sort_order: integer("sort_order").default(0).notNull(),
        is_published: boolean("is_published").default(false).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (t) => [
        uniqueIndex("room_venue_slug_unique").on(t.venue_id, t.slug),
        index("room_venue_published_idx").on(t.venue_id, t.is_published),
    ],
);
