import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { booking } from "./booking.js";

/**
 * One row per scheduled instalment on a booking. Replaces the
 * deposit/balance binary on bookings where the admin has configured a
 * custom split — public-booker submissions still seed the policy
 * default (deposit + balance) but the admin can break it into any
 * number of slices afterwards.
 *
 * Each row carries its own opaque `pay_token` so we can hand the
 * customer a per-instalment public link without exposing internal ids.
 * On a successful Stripe charge the webhook stamps `paid_at` +
 * `stripe_payment_intent_id`. For bookings still using the legacy
 * deposit/balance shape this table is simply empty.
 */
export const booking_payment = pgTable(
	"booking_payment",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		booking_id: uuid("booking_id").notNull().references(() => booking.id, { onDelete: "cascade" }),
		sort_order: integer("sort_order").default(0).notNull(),
		label: text("label").notNull(),
		amount_cents: integer("amount_cents").notNull(),
		pay_token: text("pay_token").notNull().unique(),
		due_at: timestamp("due_at", { withTimezone: true }),
		sent_at: timestamp("sent_at", { withTimezone: true }),
		paid_at: timestamp("paid_at", { withTimezone: true }),
		paid_via: text("paid_via"), // 'stripe' | 'offline'
		stripe_payment_intent_id: text("stripe_payment_intent_id"),
		offline_note: text("offline_note"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("booking_payment_booking_idx").on(t.booking_id, t.sort_order),
		index("booking_payment_token_idx").on(t.pay_token),
	],
);
