import { pgTable, uuid, text, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

// sections: [{ heading: string, paragraphs: string[] }, ...]
export const booking_agreement = pgTable("booking_agreement", {
    id: uuid("id").defaultRandom().primaryKey(),
    venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Booking Agreement"),
    intro: text("intro"),
    sections: jsonb("sections").notNull().default([]),
    version: text("version"),
    is_active: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
