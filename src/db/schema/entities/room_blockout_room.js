import { pgTable, uuid, primaryKey, index } from "drizzle-orm/pg-core";
import { room_blockout } from "./room_blockout.js";
import { room } from "./room.js";

// Join table: each row says "this blockout applies to this room".
// A blockout with zero linked rooms applies to every room at its venue.
export const room_blockout_room = pgTable(
	"room_blockout_room",
	{
		blockout_id: uuid("blockout_id").notNull().references(() => room_blockout.id, { onDelete: "cascade" }),
		room_id: uuid("room_id").notNull().references(() => room.id, { onDelete: "cascade" }),
	},
	(t) => [
		primaryKey({ columns: [t.blockout_id, t.room_id] }),
		index("room_blockout_room_room_idx").on(t.room_id),
	],
);
