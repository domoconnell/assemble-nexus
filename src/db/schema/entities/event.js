import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { booking } from "./booking.js";
import { customer } from "./customer.js";
import { event_organiser } from "./event_organiser.js";
import { file } from "./file.js";

export const EVENT_STATUSES = ["draft", "pending_review", "published", "cancelled", "past"];

export const event = pgTable(
	"event",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),
		slug: text("slug").notNull(),
		title: text("title").notNull(),
		summary: text("summary"),

		banner_file_id: uuid("banner_file_id").references(() => file.id, { onDelete: "set null" }),
		hero_file_id: uuid("hero_file_id").references(() => file.id, { onDelete: "set null" }),
		// Photo from the actual event — used by room pages' "previous events"
		// gallery in preference to the promo `banner_file_id`. Optional; admin
		// uploads after the event.
		gallery_photo_file_id: uuid("gallery_photo_file_id").references(() => file.id, { onDelete: "set null" }),

		body_blocks: jsonb("body_blocks").default([]).notNull(),
		extra_info_blocks: jsonb("extra_info_blocks").default([]).notNull(),

		starts_at: timestamp("starts_at", { withTimezone: true }),
		ends_at: timestamp("ends_at", { withTimezone: true }),
		doors_open_at: timestamp("doors_open_at", { withTimezone: true }),

		booking_id: uuid("booking_id").references(() => booking.id, { onDelete: "set null" }),
		event_organiser_id: uuid("event_organiser_id").references(() => event_organiser.id, { onDelete: "set null" }),
		// Optional CRM link — the organisation that's running this event.
		// Distinct from `event_organiser_id` (a public-facing branded entity
		// for ticket pages). Used for organiser payouts and CRM roll-ups.
		organiser_organisation_id: uuid("organiser_organisation_id"),
		organiser_customer_id: uuid("organiser_customer_id").references(() => customer.id, { onDelete: "set null" }),
		promoter_customer_id: uuid("promoter_customer_id").references(() => customer.id, { onDelete: "set null" }),

		visibility: text("visibility").notNull().default("private"),
		status: text("status").notNull().default("draft"),
		is_ticketed: boolean("is_ticketed").default(false).notNull(),
		max_occupancy: integer("max_occupancy"),

		// When true, the booking-fee (platform fee per ticket order) is added to the
		// customer's total by default. When false, the organiser absorbs it and the
		// customer is given an opt-in to cover it.
		fee_pass_through: boolean("fee_pass_through").default(false).notNull(),

		external_url: text("external_url"),

		commission_pct_x100: integer("commission_pct_x100"),
		commission_flat_cents: integer("commission_flat_cents"),

		// Short code (e.g. `ui89fg5f`) embedded in the public door-check-in URL
		// `/checkin/<code>`. Anyone with the link can mark tickets as used; rotate
		// the code from the admin event page to invalidate a shared link.
		checkin_code: text("checkin_code").unique(),

		sort_priority: integer("sort_priority").default(0).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		uniqueIndex("event_venue_slug_unique").on(t.venue_id, t.slug),
		index("event_venue_status_idx").on(t.venue_id, t.status, t.starts_at),
		index("event_booking_idx").on(t.booking_id),
	],
);
