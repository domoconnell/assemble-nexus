import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { venue } from "./venue.js";
import { user } from "./user.js";

export const room_blockout = pgTable(
	"room_blockout",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		venue_id: uuid("venue_id").notNull().references(() => venue.id, { onDelete: "cascade" }),

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
