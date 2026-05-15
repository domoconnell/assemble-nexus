import { pgTable, uuid, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { bank_account } from "./bank_account.js";

/**
 * Periodic capture of a single bank account's balance. The nightly cron
 * writes one row per sync per account. The banking page reads these to
 * render the balance-over-time chart and the dashboard widget sums the
 * latest snapshot across all the venue's active accounts.
 */
export const bank_balance_snapshot = pgTable(
	"bank_balance_snapshot",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		bank_account_id: uuid("bank_account_id").references(() => bank_account.id, { onDelete: "cascade" }),
		cleared_minor: integer("cleared_minor").notNull(),
		effective_minor: integer("effective_minor").notNull(),
		pending_minor: integer("pending_minor").default(0).notNull(),
		currency: text("currency").notNull().default("GBP"),
		source: text("source").notNull().default("starling"),
		captured_at: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [
		index("bank_balance_snapshot_venue_captured_idx").on(t.venue_id, t.captured_at),
		index("bank_balance_snapshot_account_captured_idx").on(t.bank_account_id, t.captured_at),
	],
);
