import { pgTable, uuid, text, integer, timestamp, date, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

export const POS_SOURCES = ["square_api"];

export const pos_daily_takings = pgTable(
	"pos_daily_takings",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		date: date("date", { mode: "string" }).notNull(),
		gross_cents: integer("gross_cents").default(0).notNull(),
		net_cents: integer("net_cents").default(0).notNull(),
		vat_cents: integer("vat_cents").default(0).notNull(),
		cogs_cents: integer("cogs_cents").default(0).notNull(),
		transactions_count: integer("transactions_count").default(0).notNull(),
		// Optional rollup, e.g. { food: 12345, drink: 6789, merch: 200 }
		category_breakdown: jsonb("category_breakdown"),
		source: text("source").notNull(),
		external_ref: text("external_ref"),
		synced_at: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
	},
	(t) => [
		uniqueIndex("pos_daily_takings_venue_date_unique").on(t.venue_id, t.date),
		index("pos_daily_takings_venue_idx").on(t.venue_id, t.date),
	],
);
