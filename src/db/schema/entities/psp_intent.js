import { pgTable, uuid, text, integer, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { ticket_order } from "./ticket_order.js";
import { booking } from "./booking.js";

export const PSP_INTENT_STATUSES = [
	"requires_payment_method",
	"requires_action",
	"succeeded",
	"canceled",
	"failed",
];

export const psp_intent = pgTable(
	"psp_intent",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		provider: text("provider").notNull(),
		external_id: text("external_id").notNull(),
		status: text("status").notNull(),
		amount_cents: integer("amount_cents").notNull(),
		currency: text("currency").notNull().default("gbp"),
		metadata: jsonb("metadata").default({}).notNull(),

		// Application links — at most one of these is set per row.
		ticket_order_id: uuid("ticket_order_id").references(() => ticket_order.id, { onDelete: "set null" }),
		booking_id: uuid("booking_id").references(() => booking.id, { onDelete: "set null" }),
		// invoice_id reference added later when the invoice table lands in Phase 5.

		// Opaque token returned to the client; the server validates against this.
		client_secret_hash: text("client_secret_hash").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
	},
	(t) => [
		uniqueIndex("psp_intent_provider_external_idx").on(t.provider, t.external_id),
		index("psp_intent_ticket_order_idx").on(t.ticket_order_id),
		index("psp_intent_booking_idx").on(t.booking_id),
	],
);
