import { pgTable, uuid, text, jsonb, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

export const BANK_PROVIDERS = ["starling", "revolut"];

/**
 * One row per connected bank account. A venue may have multiple — Revolut +
 * Starling, GBP + EUR, etc. The `provider` field selects which plugin
 * handles balance/transaction sync. The `credentials` JSONB is shaped
 * differently per provider (see each provider's plugin docs) so the
 * settings UI knows what to render.
 */
export const bank_account = pgTable(
	"bank_account",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		label: text("label").notNull(),
		// Provider's stable identifier for this specific account (Starling
		// `accountUid`, Revolut account id, etc). Stored separately from the
		// jsonb credentials so the sync service can index/filter on it.
		external_account_uid: text("external_account_uid"),
		credentials: jsonb("credentials").default({}).notNull(),
		currency: text("currency").notNull().default("GBP"),
		is_active: boolean("is_active").notNull().default(true),
		sort_order: integer("sort_order").default(0).notNull(),
		last_synced_at: timestamp("last_synced_at", { withTimezone: true }),
		last_sync_error: text("last_sync_error"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("bank_account_venue_active_idx").on(t.venue_id, t.is_active),
	],
);
