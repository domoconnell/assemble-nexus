import { pgTable, uuid, text, integer, timestamp, date, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { file } from "./file.js";

export const MANUAL_INCOME_KINDS = ["donation", "equipment_hire", "other"];

export const manual_income = pgTable(
	"manual_income",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		date: date("date", { mode: "string" }).notNull(),
		kind: text("kind").notNull(),
		description: text("description").notNull(),
		amount_cents: integer("amount_cents").notNull(),
		// Output VAT collected on this income (gross VAT-inclusive
		// `amount_cents` includes this). Defaults to 0 for donation /
		// outside-the-scope rows; populated on equipment hire / other
		// VATable income so the VAT return picks it up. The net (cell)
		// shown in reports is `amount_cents - vat_cents`.
		vat_cents: integer("vat_cents").default(0).notNull(),
		notes: text("notes"),
		attachment_file_id: uuid("attachment_file_id").references(() => file.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("manual_income_venue_date_idx").on(t.venue_id, t.date),
	],
);
