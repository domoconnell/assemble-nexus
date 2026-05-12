import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { event } from "./event.js";
import { customer } from "./customer.js";

export const TICKET_ORDER_STATUSES = [
	"pending",
	"paid",
	"refunded",
	"partially_refunded",
	"cancelled",
];

export const ticket_order = pgTable(
	"ticket_order",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		reference: text("reference").notNull().unique(),
		event_id: uuid("event_id").notNull().references(() => event.id, { onDelete: "restrict" }),
		customer_id: uuid("customer_id").notNull().references(() => customer.id, { onDelete: "restrict" }),
		// Optional CRM link — set when an org (rather than a private delegate)
		// is buying tickets, e.g. company block-buys.
		organisation_id: uuid("organisation_id"),

		status: text("status").notNull().default("pending"),

		subtotal_cents: integer("subtotal_cents").default(0).notNull(),
		discount_cents: integer("discount_cents").default(0).notNull(),
		vat_cents: integer("vat_cents").default(0).notNull(),
		total_cents: integer("total_cents").default(0).notNull(),

		// Platform booking-fee snapshot. cents = the fee captured at order time,
		// borne_by = "customer" (added to total) or "organiser" (deducted from
		// organiser_receives). Stored so finance dashboards / order pages don't
		// have to recompute against potentially-changed ticketing settings.
		booking_fee_cents: integer("booking_fee_cents").default(0).notNull(),
		booking_fee_borne_by: text("booking_fee_borne_by").default("organiser").notNull(),

		commission_cents: integer("commission_cents"),
		commission_pct_snapshot_x100: integer("commission_pct_snapshot_x100"),

		stripe_payment_intent_id: text("stripe_payment_intent_id"),
		stripe_charge_id: text("stripe_charge_id"),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		paid_at: timestamp("paid_at", { withTimezone: true }),
		cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("ticket_order_event_status_idx").on(t.event_id, t.status),
		index("ticket_order_customer_idx").on(t.customer_id),
	],
);
