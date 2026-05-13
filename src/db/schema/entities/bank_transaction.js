import { pgTable, uuid, text, integer, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

export const BANK_DIRECTIONS = ["IN", "OUT"];

/**
 * One row per Starling feed item we've ever seen for a venue's bank
 * account. `external_id` is Starling's `feedItemUid` and is unique per
 * venue — the sync upserts on (venue_id, external_id).
 *
 * `matched_to_id` + `matched_to_type` are placeholders for the future
 * reconciliation UI (matching an inbound transfer to a booking, etc).
 */
export const bank_transaction = pgTable(
	"bank_transaction",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		external_id: text("external_id").notNull(),
		direction: text("direction").notNull(),
		amount_minor: integer("amount_minor").notNull(),
		currency: text("currency").notNull().default("GBP"),
		counterparty_name: text("counterparty_name"),
		counterparty_account: text("counterparty_account"),
		reference: text("reference"),
		category_uid: text("category_uid"),
		source: text("source").notNull().default("starling"),
		settled_at: timestamp("settled_at", { withTimezone: true }),
		transaction_time: timestamp("transaction_time", { withTimezone: true }),
		raw_payload: jsonb("raw_payload"),
		matched_to_id: uuid("matched_to_id"),
		matched_to_type: text("matched_to_type"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
	},
	(t) => [
		uniqueIndex("bank_transaction_venue_external_unique").on(t.venue_id, t.external_id),
		index("bank_transaction_venue_time_idx").on(t.venue_id, t.transaction_time),
		index("bank_transaction_venue_settled_idx").on(t.venue_id, t.settled_at),
	],
);
