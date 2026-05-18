import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { user } from "./user.js";

export const ROOM_BLOCKOUT_KINDS = ["venue", "church"];

export const room_blockout = pgTable(
	"room_blockout",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),

		// `venue` = maintenance / private events / holidays etc. (the
		// original meaning). `church` = ongoing church use of one or more
		// rooms - shown in /admin/church-events instead of /admin/blockouts.
		kind: text("kind").notNull().default("venue"),

		starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
		ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),

		// Short label shown to admins and (optionally) on the public availability
		// calendar - e.g. "Maintenance", "Private event", "Holiday".
		reason: text("reason").notNull(),
		notes: text("notes"),

		// When true, the blockout is reflected on the public-facing availability
		// view as well as admin's. When false, it only blocks new bookings;
		// nothing leaks externally.
		is_public: boolean("is_public").default(false).notNull(),

		// Identifies a recurring series - every occurrence generated together
		// shares the same series_id. Singleton blockouts leave this null.
		series_id: uuid("series_id"),

		// Source pattern for series rows. Shape for weekly recurring:
		//   { kind: "weekly", by_weekday: ["SU"], time_start: "07:00",
		//     time_end: "14:00", ends_on: null }
		// For a finite run:
		//   { kind: "run", weekday: "TU", time_start: "19:00",
		//     time_end: "21:00", weeks: 6, starts_on: "2026-06-10" }
		// Only set on the "definition" row of a series (typically the first
		// occurrence); occurrence rows just carry the series_id.
		recurrence_rule: jsonb("recurrence_rule"),

		created_by_user_id: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("room_blockout_venue_window_idx").on(t.venue_id, t.starts_at, t.ends_at),
		index("room_blockout_series_idx").on(t.series_id),
	],
);
