import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Idempotency log for incoming webhooks. Records the provider's event
 * id the moment we accept a request, so retried deliveries (Stripe
 * resends after a 5xx, or a malicious replay outside the signature
 * timestamp window) are recognised as already-processed and skipped.
 *
 * No FK back to anything domain-specific - this is purely an audit /
 * dedup ledger.
 */
export const webhook_event = pgTable(
	"webhook_event",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		provider: text("provider").notNull(), // "stripe" today
		external_id: text("external_id").notNull(), // e.g. evt_…
		event_type: text("event_type"),
		processed_at: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("webhook_event_provider_external_unique").on(t.provider, t.external_id),
	],
);
