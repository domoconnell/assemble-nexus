import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { customer } from "./customer.js";

export const BOOKING_STATUSES = [
    "pending",
    "approved",
    "confirmed",
    "rejected",
    "cancelled",
    "completed",
];

export const booking = pgTable(
    "booking",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
        reference: text("reference").notNull().unique(),
        customer_id: uuid("customer_id").notNull().references(() => customer.id, { onDelete: "restrict" }),
        // Optional CRM link. Older bookings have this null; admin can assign
        // an organisation later. Drives roll-ups on the CRM dashboard.
        organisation_id: uuid("organisation_id"),
        status: text("status").notNull().default("pending"),

        subtotal_cents: integer("subtotal_cents").default(0).notNull(),
        vat_cents: integer("vat_cents").default(0).notNull(),
        total_cents: integer("total_cents").default(0).notNull(),

        // Snapshot of the rack-rate price the booking *would* have been
        // before an admin overrode it. Populated the first time
        // `overrideBookingTotalAction` runs; left untouched on subsequent
        // overrides so the "what was the standard rate?" reference stays
        // stable. Cleared back to NULL if the override is removed.
        // Effective discount = original_total_cents - total_cents.
        original_subtotal_cents: integer("original_subtotal_cents"),
        original_vat_cents: integer("original_vat_cents"),
        original_total_cents: integer("original_total_cents"),
        override_reason: text("override_reason"),
        override_applied_at: timestamp("override_applied_at", { withTimezone: true }),
        override_by_user_id: uuid("override_by_user_id"),

        discount_id: uuid("discount_id"),
        discount_label_snapshot: text("discount_label_snapshot"),
        discount_percent_x100_snapshot: integer("discount_percent_x100_snapshot"),
        discount_amount_cents: integer("discount_amount_cents").default(0).notNull(),

        ticketing_enabled: boolean("ticketing_enabled").default(false).notNull(),
        ticketing_setup_fee_pct_x100_snapshot: integer("ticketing_setup_fee_pct_x100_snapshot"),
        ticketing_setup_fee_cents: integer("ticketing_setup_fee_cents").default(0).notNull(),

        deposit_required_cents: integer("deposit_required_cents").default(0).notNull(),
        deposit_non_refundable_cents: integer("deposit_non_refundable_cents").default(0).notNull(),
        deposit_paid_cents: integer("deposit_paid_cents").default(0).notNull(),
        balance_paid_cents: integer("balance_paid_cents").default(0).notNull(),

        deposit_policy_snapshot: jsonb("deposit_policy_snapshot"),
        agreement_snapshot: jsonb("agreement_snapshot"),
        agreement_accepted_at: timestamp("agreement_accepted_at", { withTimezone: true }),

        // Set when this booking was created as a recurring series. Captures the
        // original pattern (e.g. { kind: "weekly", interval: 1, count: 12,
        // by_weekday: ["TU"], time: "19:00-21:00" }) for display and audit.
        // The individual occurrences live as `booking_segment` rows; soft-delete
        // a segment to skip/cancel that occurrence.
        recurrence_rule: jsonb("recurrence_rule"),

        stripe_deposit_payment_intent_id: text("stripe_deposit_payment_intent_id"),

        // Balance lifecycle. `balance_invoice_issued_at` is set by the admin
        // action that emails the customer the "balance due" notice; the
        // customer can still pay anytime after deposit even without that step.
        // `balance_paid_at` lands when balance is fully paid (online or offline).
        balance_invoice_issued_at: timestamp("balance_invoice_issued_at", { withTimezone: true }),
        balance_paid_at: timestamp("balance_paid_at", { withTimezone: true }),

        customer_notes: text("customer_notes"),
        internal_notes: text("internal_notes"),

        submitted_at: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
        approved_at: timestamp("approved_at", { withTimezone: true }),
        confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
        rejected_at: timestamp("rejected_at", { withTimezone: true }),
        cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
        completed_at: timestamp("completed_at", { withTimezone: true }),

        // Tracks which reminder offsets (in days) have already been emailed
        // so the daily cron doesn't double-send. Shape: { "7": iso, "1": iso }.
        reminders_sent: jsonb("reminders_sent").default({}).notNull(),

        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (t) => [
        index("booking_venue_status_idx").on(t.venue_id, t.status),
        index("booking_customer_idx").on(t.customer_id),
    ],
);
