import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { user } from "./user.js";

export const customer = pgTable(
    "customer",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        first_name: text("first_name").notNull(),
        last_name: text("last_name").notNull(),
        email: text("email").notNull(),
        phone: text("phone"),
        organisation: text("organisation"),
        notes: text("notes"),
        marketing_opt_in: boolean("marketing_opt_in").default(false).notNull(),
        user_id: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (t) => [index("customer_email_idx").on(t.email)],
);
