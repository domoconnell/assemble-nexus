import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";

// One row per page per venue. `content` is a free-form jsonb whose shape is
// determined by the page's schema in `src/site/content/page-schemas.js`.
// Pages read this at render with sensible code-level defaults so removing or
// emptying a field never breaks the public site.
export const site_content = pgTable(
	"site_content",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		page_key: text("page_key").notNull(),
		content: jsonb("content").default({}).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("site_content_venue_page_unique").on(t.venue_id, t.page_key),
	],
);
