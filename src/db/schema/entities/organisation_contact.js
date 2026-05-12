import { pgTable, uuid, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { organisation } from "./organisation.js";
import { contact } from "./contact.js";

export const ORGANISATION_CONTACT_ROLES = [
	"primary_booker",
	"finance",
	"onsite",
	"director",
	"other",
];

export const organisation_contact = pgTable(
	"organisation_contact",
	{
		organisation_id: uuid("organisation_id").notNull().references(() => organisation.id, { onDelete: "cascade" }),
		contact_id: uuid("contact_id").notNull().references(() => contact.id, { onDelete: "cascade" }),
		role: text("role").notNull().default("other"),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.organisation_id, t.contact_id] }),
		index("organisation_contact_contact_idx").on(t.contact_id),
	],
);
