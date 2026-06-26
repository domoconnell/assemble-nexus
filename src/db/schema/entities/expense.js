import { pgTable, uuid, text, integer, timestamp, date, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { expense_category } from "./expense_category.js";
import { file } from "./file.js";
import { event } from "./event.js";
import { booking } from "./booking.js";

export const expense = pgTable(
	"expense",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		expense_category_id: uuid("expense_category_id").references(() => expense_category.id, { onDelete: "set null" }),
		// `spend` = money out (the usual case). `refund` = money RECEIVED back
		// from a supplier / category (e.g. Olilo crediting us). We store the
		// amount as a positive value in both cases and let `kind` drive the
		// sign in reports — Net spend = SUM(CASE WHEN kind='refund' THEN
		// -amount_cents ELSE amount_cents END).
		kind: text("kind").notNull().default("spend"),
		date: date("date", { mode: "string" }).notNull(),
		description: text("description").notNull(),
		amount_cents: integer("amount_cents").notNull(),
		// VAT portion of `amount_cents` (input VAT we paid). Defaults to 0
		// for expenses where the supplier isn't VAT-registered or for legacy
		// rows pre-dating the column. Used in the VAT return's Box 4.
		vat_cents: integer("vat_cents").default(0).notNull(),
		supplier_name: text("supplier_name"),
		attachment_file_id: uuid("attachment_file_id").references(() => file.id, { onDelete: "set null" }),
		linked_event_id: uuid("linked_event_id").references(() => event.id, { onDelete: "set null" }),
		linked_booking_id: uuid("linked_booking_id").references(() => booking.id, { onDelete: "set null" }),
		// Optional CRM link - tag an expense as paid TO a specific
		// organisation, e.g. an organiser payout.
		organisation_id: uuid("organisation_id"),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("expense_venue_date_idx").on(t.venue_id, t.date),
		index("expense_category_idx").on(t.expense_category_id),
		index("expense_linked_event_idx").on(t.linked_event_id),
		index("expense_linked_booking_idx").on(t.linked_booking_id),
	],
);
