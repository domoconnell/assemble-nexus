import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { user } from "./user.js";

// A person the venue does business with. Distinct from `user` (auth identity)
// and `customer` (one row per booking). A contact can sit on multiple
// organisations via `organisation_contact`, and optionally link to a `user`
// if they sign in.
export const contact = pgTable(
	"contact",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		first_name: text("first_name").notNull(),
		last_name: text("last_name"),
		email: text("email"),
		phone: text("phone"),
		notes: text("notes"),
		user_id: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("contact_venue_email_idx").on(t.venue_id, t.email),
	],
);
