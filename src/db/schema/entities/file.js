import { pgTable, uuid, text, timestamp, boolean, bigint } from "drizzle-orm/pg-core";
import { user } from "./user.js";

export const file = pgTable("file", {
    id: uuid("id").defaultRandom().primaryKey(),
    original_name: text("original_name").notNull(),
    mime_type: text("mime_type").notNull(),
    size_bytes: bigint("size_bytes", { mode: "number" }).notNull(),
    s3_key: text("s3_key").notNull().unique(),
    public_url: text("public_url"),
    file_type: text("file_type").notNull(),
    is_public: boolean("is_public").default(true).notNull(),
    uploaded_by_user_id: uuid("uploaded_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
