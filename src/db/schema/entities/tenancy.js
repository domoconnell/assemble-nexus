import {
	pgTable,
	uuid,
	text,
	integer,
	jsonb,
	timestamp,
	boolean,
	index,
} from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { customer } from "./customer.js";
import { room } from "./room.js";
import { organisation } from "./organisation.js";
import { contact } from "./contact.js";

export const TENANCY_STATUSES = ["active", "paused", "ended"];

/**
 * A tenancy is a contract between the venue and an organisation. It can
 * span multiple rooms with different billing modes, so the contract
 * row itself is now venue/org metadata; the rooms + rates live in
 * `tenancy_line` (one row per "thing they pay for").
 *
 * Example contract: Home Start Newark uses The Studio every Tue/Thu
 * morning (scheduled, per-session) AND occupies Room 1D + Room 1E
 * permanently for storage (occupancy, fixed monthly). One tenancy,
 * three lines, one invoice each month.
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

		status: text("status").notNull().default("active"),

		label: text("label"), // optional human label e.g. "Home Start Newark — combined"
		starts_on: text("starts_on").notNull(), // YYYY-MM-DD
		ends_on: text("ends_on"), // YYYY-MM-DD, nullable = open-ended

		invoice_day_of_month: integer("invoice_day_of_month").default(1).notNull(),

		// Optional fixed monthly amount applied to the whole tenancy. When
		// set, the invoicer sums the lines as the uncapped subtotal and
		// emits an "adjustment" line to land on this exact figure.
		monthly_override_cents: integer("monthly_override_cents"),

		// When true and the organisation has an active direct-debit mandate,
		// the invoicer cron auto-charges each issued invoice via Stripe Bacs.
		// When false, the invoice is just emitted and the admin chases payment
		// manually. Defaults false so existing tenancies keep current behaviour.
		auto_bill_via_dd: boolean("auto_bill_via_dd").default(false).notNull(),

		notes: text("notes"),

		// LEGACY inline-agreement columns. Superseded by `tenancy_agreement`.
		// Kept on the row during the transition; not read or written by new
		// code. Drop when convenient.
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
		index("tenancy_agreement_token_idx").on(t.agreement_token),
	],
);

export const TENANCY_LINE_KINDS = ["occupancy", "scheduled"];
export const SCHEDULED_BILLING_MODES = ["per_session", "per_hour", "fixed_monthly"];

/**
 * One billable thing on a tenancy contract.
 *
 * `occupancy` — the organisation has this (non-public) room full-time.
 *   No sessions are generated; calendar isn't touched. Billed at the
 *   fixed `monthly_rate_cents` regardless of usage.
 *
 * `scheduled`  — recurring sessions in a (usually public) room. Rules
 *   define when sessions happen; `billing_mode` decides how the month's
 *   amount is calculated:
 *     per_session   — count of non-cancelled sessions × per_session_rate_cents
 *     per_hour      — total session hours that month × per_hour_rate_cents
 *     fixed_monthly — flat fixed_monthly_rate_cents regardless of count
 *
 * Validation lives in the server action (occupancy lines must point at
 * a non-public room; scheduled lines must have at least one rule).
 */
export const tenancy_line = pgTable(
	"tenancy_line",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		tenancy_id: uuid("tenancy_id").notNull().references(() => tenancy.id, { onDelete: "cascade" }),
		room_id: uuid("room_id").notNull().references(() => room.id, { onDelete: "restrict" }),

		kind: text("kind").notNull(), // "occupancy" | "scheduled"
		label: text("label"), // optional, shown on invoices

		// occupancy
		monthly_rate_cents: integer("monthly_rate_cents"),

		// scheduled: rules array (same shape as the old tenancy.schedule_rule)
		schedule_rule: jsonb("schedule_rule"),
		billing_mode: text("billing_mode"), // "per_session" | "per_hour" | "fixed_monthly"
		per_session_rate_cents: integer("per_session_rate_cents"),
		per_hour_rate_cents: integer("per_hour_rate_cents"),
		fixed_monthly_rate_cents: integer("fixed_monthly_rate_cents"),

		sort_order: integer("sort_order").default(0).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("tenancy_line_tenancy_idx").on(t.tenancy_id),
		index("tenancy_line_room_idx").on(t.room_id),
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
		// When the public sign link stops working. Set to sent_at + 30 days
		// the moment an agreement is sent; expired tokens render the
		// public page as 404 so a forwarded email can't be acted on
		// months later. NULL = no expiry (legacy rows, fail-open).
		expires_at: timestamp("expires_at", { withTimezone: true }),
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
 * One occurrence of a scheduled tenancy_line. Materialised by the
 * daily cron a few months ahead so the calendar can see future
 * occurrences. Cancel a single session (status = cancelled) to skip a
 * week without affecting the rest of the series.
 */
export const tenancy_session = pgTable(
	"tenancy_session",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		tenancy_id: uuid("tenancy_id").notNull().references(() => tenancy.id, { onDelete: "cascade" }),
		// Which tenancy_line generated this session. Needed because a
		// tenancy can host multiple scheduled lines (different rooms /
		// billing modes); the invoicer groups sessions by line to bill
		// correctly. Set null on line delete so the session can be
		// reattached / re-billed manually if needed.
		tenancy_line_id: uuid("tenancy_line_id").references(() => tenancy_line.id, { onDelete: "set null" }),

		starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
		ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),

		status: text("status").notNull().default("scheduled"),

		// The id of the schedule rule (a member of tenancy_line.schedule_rule[])
		// that materialised this session. Lets the invoice show which rule
		// produced which sessions without joining back into the jsonb.
		rule_id: uuid("rule_id"),

		// Snapshot of the per-session rate at the time the session was
		// materialised. Pulled from the line's per_session_rate_cents
		// when billing_mode === "per_session". Frozen so rate changes
		// don't retro-price.
		rate_cents_snapshot: integer("rate_cents_snapshot"),

		cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
		cancelled_reason: text("cancelled_reason"),

		// Once invoiced, points at the tenancy_invoice that included this
		// session. Read-only after that. `set null` on invoice delete so a
		// voided/deleted invoice frees the sessions to be re-attached.
		invoice_id: uuid("invoice_id").references(() => tenancy_invoice.id, { onDelete: "set null" }),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("tenancy_session_tenancy_idx").on(t.tenancy_id, t.starts_at),
		index("tenancy_session_window_idx").on(t.starts_at, t.ends_at),
		index("tenancy_session_line_idx").on(t.tenancy_line_id, t.starts_at),
	],
);

export const TENANCY_INVOICE_STATUSES = ["draft", "issued", "paid", "void"];

/**
 * Monthly invoice generated by the daily cron on the tenancy's
 * `invoice_day_of_month`. Reference shape: `TI-YYYY-XXXX`.
 *
 * Itemised lines are in `tenancy_invoice_line` - one per tenancy_line,
 * with the human description + amount as billed for that month.
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
		// The "would-have-been" sum of line amounts before the tenancy's
		// monthly override (or any other cap) was applied. NULL when no
		// override was in play. When non-null, render the invoice with
		// an "Adjustment" line for (uncapped - subtotal).
		uncapped_subtotal_cents: integer("uncapped_subtotal_cents"),
		// Sum of every line's "rack" rate at issuance — i.e. what the
		// rooms would have cost at the venue's headline hourly rate. Used
		// to show "Total reduction vs standard hire" on the invoice.
		rack_subtotal_cents: integer("rack_subtotal_cents"),
		// Sum of per-line (rack - amount) discounts at issuance.
		line_discount_total_cents: integer("line_discount_total_cents").default(0).notNull(),
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

/**
 * One billable item on a tenancy invoice. Frozen snapshot of how the
 * line was computed for that period, so the historical invoice always
 * renders the same even if the tenancy_line is later edited.
 */
export const tenancy_invoice_line = pgTable(
	"tenancy_invoice_line",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		invoice_id: uuid("invoice_id").notNull().references(() => tenancy_invoice.id, { onDelete: "cascade" }),
		// The tenancy_line that produced this row at billing time. `set null`
		// on line delete so the invoice history survives line cleanup.
		tenancy_line_id: uuid("tenancy_line_id").references(() => tenancy_line.id, { onDelete: "set null" }),

		// Human-readable description rendered on the invoice. e.g.
		//   "Room 1D — full-time occupancy"
		//   "The Studio — 8 sessions × £20.00"
		//   "The Studio — 32 hours × £5.00"
		//   "The Studio — fixed monthly"
		description: text("description").notNull(),

		// Snapshot of how the line was computed.
		kind: text("kind").notNull(), // occupancy | scheduled
		billing_mode: text("billing_mode"), // per_session | per_hour | fixed_monthly | NULL for occupancy
		quantity: integer("quantity"), // sessions count, hours × 60 in minutes for per_hour, NULL for fixed
		unit_cents: integer("unit_cents"), // per-session / per-hour rate snapshot
		amount_cents: integer("amount_cents").notNull(),

		// Snapshot of the room's headline hourly rate at issuance, plus the
		// derived "rack" cost (sessions × rack rate) and discount (rack -
		// amount). Lets historical invoices keep the same breakdown even
		// after the public hourly rate changes.
		rack_hourly_rate_cents: integer("rack_hourly_rate_cents"),
		rack_cents: integer("rack_cents"),
		discount_cents: integer("discount_cents"),

		sort_order: integer("sort_order").default(0).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [
		index("tenancy_invoice_line_invoice_idx").on(t.invoice_id),
	],
);
