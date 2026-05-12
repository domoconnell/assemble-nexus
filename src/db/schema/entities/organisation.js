import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
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
		// Set after a contact has been added; helps the list view show a
		// "primary booker" without joining the contacts table on every render.
		primary_contact_id: uuid("primary_contact_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("organisation_venue_idx").on(t.venue_id, t.name),
	],
);
