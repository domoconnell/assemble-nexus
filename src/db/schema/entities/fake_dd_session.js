import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenancy } from "./tenancy.js";

/**
 * Fake-PSP equivalent of a Stripe Checkout `setup` session for Bacs
 * Direct Debit. Lets the standard tenancy DD flow run end-to-end
 * against a sandbox bank-details form, without a live Stripe account.
 *
 * Lifecycle:
 *   `open`      - row created when the setup page launches the session.
 *   `complete`  - tenant submitted the sandbox form successfully.
 *                 customer_id + payment_method_id are populated.
 *   `cancelled` - tenant clicked cancel on the sandbox.
 *
 * Behavioural convention to match the rest of FakePSP:
 *   - Account number ending "0000" simulates a hard decline.
 */
export const fake_dd_session = pgTable(
	"fake_dd_session",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		external_id: text("external_id").notNull().unique(), // `fdd_…`
		tenancy_id: uuid("tenancy_id").notNull().references(() => tenancy.id, { onDelete: "cascade" }),

		status: text("status").notNull().default("open"),

		success_url: text("success_url").notNull(),
		cancel_url: text("cancel_url").notNull(),

		// Captured on completion. Last4 only for the account number - we
		// never store the full PAN even for fake data.
		account_name: text("account_name"),
		account_last4: text("account_last4"),
		sort_code: text("sort_code"),

		// Synthetic Stripe-shaped identifiers we hand back to the rest of
		// the system so it can treat the fake mandate exactly like a real one.
		customer_id: text("customer_id"),
		payment_method_id: text("payment_method_id"),

		completed_at: timestamp("completed_at", { withTimezone: true }),
		cancelled_at: timestamp("cancelled_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
	},
	(t) => [
		index("fake_dd_session_tenancy_idx").on(t.tenancy_id),
		index("fake_dd_session_status_idx").on(t.status),
	],
);
