import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

export const ORGANISATION_KINDS = ["church", "business", "charity", "individual", "other"];

export const organisation = pgTable(
	"organisation",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		kind: text("kind").notNull().default("other"),
		notes: text("notes"),
		// Billing address rendered on tenancy invoices (each entry is one
		// line — same shape as `venue.address_lines`). Optional; falls back
		// to "{organisation_name}" alone when not set.
		address_lines: jsonb("address_lines"),
		// UK VAT number (if applicable). Rendered on the invoice. Free-text
		// — we don't validate the format because organisations often paste
		// it with weird whitespace.
		vat_number: text("vat_number"),
		// Set after a contact has been added; helps the list view show a
		// "primary booker" without joining the contacts table on every render.
		primary_contact_id: uuid("primary_contact_id"),

		// Direct Debit lives on the organisation (the bank-account owner)
		// not on the tenancy - one mandate covers all of an org's
		// tenancies + any other charges (one-off invoices, deposits, etc).
		// `dd_token` is the opaque public token the no-auth setup page
		// resolves against. `direct_debit_mandate_id` is the Stripe
		// PaymentMethod id (or a fake `fpm_…` in the FakePSP path).
		dd_token: text("dd_token"),
		stripe_customer_id: text("stripe_customer_id"),
		direct_debit_mandate_id: text("direct_debit_mandate_id"),
		direct_debit_ready_at: timestamp("direct_debit_ready_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("organisation_venue_idx").on(t.venue_id, t.name),
		index("organisation_dd_token_idx").on(t.dd_token),
	],
);
