import {
	pgTable,
	uuid,
	text,
	integer,
	jsonb,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

/**
 * Ad-hoc one-off invoices created OUTSIDE the tenancy monthly billing
 * flow. The canonical use-case is an admin staring at a bank transaction
 * for an organisation they don't have a tenancy / booking for — they
 * want a real invoice on file for it so the bank reconciles, the org's
 * payment history captures it, and the PDF can be sent to the customer
 * if they ask.
 *
 * Rows can link to a CRM `organisation` for the "real" billed-to (with
 * its address + VAT details) OR carry ad-hoc customer details for
 * one-off jobs where there's no organisation in the CRM yet.
 *
 * A `discount_cents` field captures the bank-anchored discount: when
 * the entered line items sum to more than the bank transaction amount,
 * the action auto-derives a discount so the issued total matches what
 * was actually received. The discount appears as a separate line on
 * the PDF so the customer sees the saving.
 *
 * Linked back to the bank_transaction via the existing
 * `bank_transaction.matched_to_id` + `matched_to_type = 'manual_invoice'`
 * mechanism — same shape as the other matchable entity types.
 */
export const manual_invoice = pgTable(
	"manual_invoice",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id")
			.notNull()
			.references(() => venue.id, { onDelete: "cascade" }),

		// Auto-generated public reference, e.g. "MI-0042". Unique per
		// venue.
		reference: text("reference").notNull().unique(),

		// Optional CRM link. When set, the PDF reads name + address +
		// VAT from the live organisation row. When null we use the
		// `customer_*` fields below.
		organisation_id: uuid("organisation_id"),

		// Ad-hoc customer fallback when no CRM org is linked. Each field
		// is optional individually — `customer_address_lines` is a JSON
		// array of strings ([line1, line2, …]) matching the venue +
		// organisation address shape so the PDF helper can render them
		// the same way.
		customer_name: text("customer_name"),
		customer_email: text("customer_email"),
		customer_address_lines: jsonb("customer_address_lines"),
		customer_vat_number: text("customer_vat_number"),

		// Money math, all in minor units (pence).
		//   subtotal_cents = sum of line items
		//   discount_cents = the auto-derived discount that pulls the
		//                    total down to match the bank transaction
		//   vat_cents      = currently always 0 (admin can patch later
		//                    if we add VAT-aware lines)
		//   total_cents    = subtotal - discount + vat
		subtotal_cents: integer("subtotal_cents").default(0).notNull(),
		discount_cents: integer("discount_cents").default(0).notNull(),
		vat_cents: integer("vat_cents").default(0).notNull(),
		total_cents: integer("total_cents").default(0).notNull(),

		// Free-text body / notes shown on the PDF underneath the lines.
		description: text("description"),
		notes: text("notes"),

		issued_at: timestamp("issued_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		// Stamped when the invoice was matched to a bank transaction so
		// reports can treat it as paid — mirrors `tenancy_invoice.paid_at`.
		paid_at: timestamp("paid_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("manual_invoice_venue_idx").on(t.venue_id, t.issued_at),
		index("manual_invoice_organisation_idx").on(t.organisation_id),
	],
);

/**
 * One billable line on a manual invoice. Same shape as
 * tenancy_invoice_line but simpler — no rack / billing-mode snapshots
 * since these aren't generated from a schedule.
 */
export const manual_invoice_line = pgTable(
	"manual_invoice_line",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		invoice_id: uuid("invoice_id")
			.notNull()
			.references(() => manual_invoice.id, { onDelete: "cascade" }),
		description: text("description").notNull(),
		amount_cents: integer("amount_cents").notNull(),
		sort_order: integer("sort_order").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [index("manual_invoice_line_invoice_idx").on(t.invoice_id)],
);
