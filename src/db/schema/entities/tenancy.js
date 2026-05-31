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
import { customer } from "./customer.js";
import { room } from "./room.js";
import { organisation } from "./organisation.js";
import { contact } from "./contact.js";

export const TENANCY_KINDS = ["private_rental", "scheduled_recurring"];
export const TENANCY_STATUSES = ["active", "paused", "ended"];

/**
 * A tenancy is an ongoing room-use relationship with a customer - a
 * subscription rather than a one-off booking. Two flavours:
 *
 *   `private_rental` - a private (non-public) room is exclusively this
 *   customer's. Flat `monthly_rate_cents`, no calendar entries (the room
 *   is just theirs), one invoice per month.
 *
 *   `scheduled_recurring` - a public room is reserved on a repeating
 *   weekly pattern (e.g. Wed + Thu mornings). The materialiser generates
 *   one `tenancy_session` per occurrence; sessions block the calendar
 *   like booking_segments do. Invoice each month = sum of non-cancelled
 *   sessions in that month at `per_session_rate_cents`.
 *
 * Open-ended by default - set `ends_on` to wind down.
 */
export const tenancy = pgTable(
	"tenancy",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		// Legacy customer pointer - kept nullable for transition; new tenancies
		// link through organisation_id instead.
		customer_id: uuid("customer_id").references(() => customer.id, { onDelete: "set null" }),
		organisation_id: uuid("organisation_id").references(() => organisation.id, { onDelete: "restrict" }),
		// Optional override for the person within the organisation we email
		// (defaults to organisation.primary_contact_id if null).
		contact_id: uuid("contact_id").references(() => contact.id, { onDelete: "set null" }),
		room_id: uuid("room_id").notNull().references(() => room.id, { onDelete: "restrict" }),

		kind: text("kind").notNull(),
		status: text("status").notNull().default("active"),

		label: text("label"), // optional human label e.g. "Sarah's pottery studio"
		starts_on: text("starts_on").notNull(), // YYYY-MM-DD
		ends_on: text("ends_on"), // YYYY-MM-DD, nullable = open-ended

		invoice_day_of_month: integer("invoice_day_of_month").default(1).notNull(),

		// private_rental
		monthly_rate_cents: integer("monthly_rate_cents"),

		// scheduled_recurring
		// e.g. { by_weekday: ["WE","TH"], time_start: "09:00", time_end: "13:00",
		//        booking_type_id: "...", layout_id: "..." }
		schedule_rule: jsonb("schedule_rule"),
		per_session_rate_cents: integer("per_session_rate_cents"),

		notes: text("notes"),

		// LEGACY inline-agreement columns. Superseded by the
		// `tenancy_agreement` table below. Kept temporarily during the
		// migration window; not read or written by new code. Will be
		// dropped in a follow-up migration.
		agreement_html: text("agreement_html"),
		agreement_token: text("agreement_token"),
		agreement_sent_at: timestamp("agreement_sent_at", { withTimezone: true }),
		agreement_signed_at: timestamp("agreement_signed_at", { withTimezone: true }),
		agreement_signed_by_name: text("agreement_signed_by_name"),
		agreement_signed_by_ip: text("agreement_signed_by_ip"),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("tenancy_venue_status_idx").on(t.venue_id, t.status),
		index("tenancy_organisation_idx").on(t.organisation_id),
		index("tenancy_room_idx").on(t.room_id),
		index("tenancy_agreement_token_idx").on(t.agreement_token),
	],
);

export const TENANCY_AGREEMENT_STATUSES = ["draft", "sent", "signed", "cancelled"];

/**
 * History of agreements on a tenancy. A tenancy can have many over its
 * lifetime - the active one is the latest non-cancelled, non-deleted row.
 * A new agreement is drafted (status="draft"), then sent (status="sent",
 * with sent_at), then signed by the tenant (status="signed", with
 * signed_at + signer details), or cancelled by admin (status="cancelled",
 * with cancelled_at + reason). Cancellation triggers an email; sending
 * triggers an email; signing triggers an email.
 */
export const tenancy_agreement = pgTable(
	"tenancy_agreement",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		tenancy_id: uuid("tenancy_id").notNull().references(() => tenancy.id, { onDelete: "cascade" }),

		status: text("status").notNull().default("draft"),

		// Snapshot of the template HTML at the time the draft was created.
		// Admin can hand-edit this on a draft before sending.
		html: text("html").notNull(),

		// Random opaque token used by the public sign page
		// (/tenancy-agreement/[token]/sign) so the tenant doesn't need an
		// account. Generated when the draft is created.
		token: text("token").notNull(),

		sent_at: timestamp("sent_at", { withTimezone: true }),
		signed_at: timestamp("signed_at", { withTimezone: true }),
		signed_by_name: text("signed_by_name"),
		signed_by_ip: text("signed_by_ip"),
		// Persisted snapshot of the signed agreement, rendered to PDF and
		// uploaded to S3 via the `file` table. Populated by the sign action
		// after a successful signature. Soft-delete-safe (set null on file
		// deletion) so the agreement row never dangles.
		pdf_file_id: uuid("pdf_file_id"),
		cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
		cancelled_reason: text("cancelled_reason"),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("tenancy_agreement_tenancy_status_idx").on(t.tenancy_id, t.status),
		index("tenancy_agreement_token_unique_idx").on(t.token),
	],
);

export const TENANCY_SESSION_STATUSES = ["scheduled", "cancelled", "completed"];

/**
 * One occurrence of a scheduled_recurring tenancy. Materialised by the
 * daily cron a few months ahead so the calendar can see future
 * occurrences. Cancel a single session (status = cancelled) to skip a
 * week without affecting the rest of the series.
 */
export const tenancy_session = pgTable(
	"tenancy_session",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		tenancy_id: uuid("tenancy_id").notNull().references(() => tenancy.id, { onDelete: "cascade" }),

		starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
		ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),

		status: text("status").notNull().default("scheduled"),

		// Snapshot of the tenancy's per-session rate at the time the session
		// was materialised. Lets us change the headline rate without
		// reprice-ing already-invoiced months.
		rate_cents_snapshot: integer("rate_cents_snapshot"),

		cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
		cancelled_reason: text("cancelled_reason"),

		// Once invoiced, points at the tenancy_invoice that included this
		// session. Read-only after that.
		invoice_id: uuid("invoice_id"),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("tenancy_session_tenancy_idx").on(t.tenancy_id, t.starts_at),
		index("tenancy_session_window_idx").on(t.starts_at, t.ends_at),
	],
);

export const TENANCY_INVOICE_STATUSES = ["draft", "issued", "paid", "void"];

/**
 * Monthly invoice generated by the daily cron on the tenancy's
 * `invoice_day_of_month`. Reference shape: `TI-YYYY-XXXX`.
 */
export const tenancy_invoice = pgTable(
	"tenancy_invoice",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		tenancy_id: uuid("tenancy_id").notNull().references(() => tenancy.id, { onDelete: "restrict" }),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		reference: text("reference").notNull().unique(),

		period_ym: text("period_ym").notNull(), // YYYY-MM

		status: text("status").notNull().default("issued"),

		subtotal_cents: integer("subtotal_cents").default(0).notNull(),
		vat_cents: integer("vat_cents").default(0).notNull(),
		total_cents: integer("total_cents").default(0).notNull(),

		issued_at: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
		paid_at: timestamp("paid_at", { withTimezone: true }),

		notes: text("notes"),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("tenancy_invoice_tenancy_period_idx").on(t.tenancy_id, t.period_ym),
		index("tenancy_invoice_venue_status_idx").on(t.venue_id, t.status),
	],
);
