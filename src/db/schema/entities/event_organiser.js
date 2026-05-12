import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

export const event_organiser = pgTable(
	"event_organiser",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		email_domain: text("email_domain"),
		contact_email: text("contact_email"),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		uniqueIndex("event_organiser_venue_slug_unique").on(t.venue_id, t.slug),
		index("event_organiser_email_domain_idx").on(t.venue_id, t.email_domain),
	],
);
