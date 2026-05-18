import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { bank_account } from "./bank_account.js";

export const BANK_DIRECTIONS = ["IN", "OUT"];

/**
 * One row per feed item we've ever seen for one of a venue's bank
 * accounts. `external_id` is the provider's stable id (Starling
 * `feedItemUid`, Revolut `${tx.id}:${leg.leg_id}`) and is unique per
 * bank account - the sync upserts on (bank_account_id, external_id).
 *
 * `is_transfer` flags movements between two of the venue's own bank
 * accounts so we can exclude them from income/expense totals. Set during
 * sync by matching counterparty info against other bank_accounts of the
 * same venue.
 *
 * `is_church_transfer` flags outbound transactions to the church's bank
 * account, configured per-venue in the `church_transfer` setting. These
 * are excluded from in/out totals (like inter-account transfers) but are
 * also surfaced separately so the ledger can show "available to transfer
 * to church" = cumulative available-for-church minus the sum of these.
 * Set during sync by matching counterparty against the church_transfer
 * setting; admins can also flip it manually.
 *
 * `matched_to_id` + `matched_to_type` are placeholders for the future
 * reconciliation UI (matching an inbound transfer to a booking, etc).
 */
export const bank_transaction = pgTable(
	"bank_transaction",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		bank_account_id: uuid("bank_account_id").references(() => bank_account.id, { onDelete: "cascade" }),
		external_id: text("external_id").notNull(),
		direction: text("direction").notNull(),
		amount_minor: integer("amount_minor").notNull(),
		currency: text("currency").notNull().default("GBP"),
		counterparty_name: text("counterparty_name"),
		counterparty_account: text("counterparty_account"),
		reference: text("reference"),
		category_uid: text("category_uid"),
		source: text("source").notNull().default("starling"),
		is_transfer: boolean("is_transfer").default(false).notNull(),
		is_church_transfer: boolean("is_church_transfer").default(false).notNull(),
		settled_at: timestamp("settled_at", { withTimezone: true }),
		transaction_time: timestamp("transaction_time", { withTimezone: true }),
		raw_payload: jsonb("raw_payload"),
		matched_to_id: uuid("matched_to_id"),
		matched_to_type: text("matched_to_type"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
	},
	(t) => [
		uniqueIndex("bank_transaction_account_external_unique").on(t.bank_account_id, t.external_id),
		index("bank_transaction_venue_time_idx").on(t.venue_id, t.transaction_time),
		index("bank_transaction_venue_settled_idx").on(t.venue_id, t.settled_at),
		index("bank_transaction_account_settled_idx").on(t.bank_account_id, t.settled_at),
	],
);
