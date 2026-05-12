import { pgTable, uuid, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { role } from "./role.js";
import { permission } from "./permission.js";

export const role_permission = pgTable(
    "role_permission",
    {
        role_id: uuid("role_id").notNull().references(() => role.id, { onDelete: "cascade" }),
        permission_id: uuid("permission_id").notNull().references(() => permission.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.role_id, table.permission_id] }),
    ],
);
