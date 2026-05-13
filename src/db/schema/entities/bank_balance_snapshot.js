import { pgTable, uuid, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

/**
 * Periodic capture of the bank account balance. The nightly cron writes one
 * row per sync. The banking page reads these in order to render the
 * balance-over-time chart without having to derive balance from transaction
 * deltas. New venues will have a gap until the first sync — that's fine.
 */
export const bank_balance_snapshot = pgTable(
	"bank_balance_snapshot",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		cleared_minor: integer("cleared_minor").notNull(),
		effective_minor: integer("effective_minor").notNull(),
		pending_minor: integer("pending_minor").default(0).notNull(),
		currency: text("currency").notNull().default("GBP"),
		source: text("source").notNull().default("starling"),
		captured_at: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [index("bank_balance_snapshot_venue_captured_idx").on(t.venue_id, t.captured_at)],
);
