import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { room } from "./room.js";
import { facility_category } from "./facility_category.js";

export const facility_package_group = pgTable(
	"facility_package_group",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		room_id: uuid("room_id").notNull().references(() => room.id, { onDelete: "cascade" }),
		category_id: uuid("category_id").references(() => facility_category.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		sort_order: integer("sort_order").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [index("facility_package_group_room_idx").on(t.room_id, t.category_id, t.sort_order)],
);
