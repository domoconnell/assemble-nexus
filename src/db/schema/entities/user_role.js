import { pgTable, uuid, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { user } from "./user.js";
import { role } from "./role.js";

export const user_role = pgTable(
    "user_role",
    {
        user_id: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
        role_id: uuid("role_id").notNull().references(() => role.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.user_id, table.role_id] }),
    ],
);
