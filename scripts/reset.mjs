/**
 * Reset the database to a workable starting state.
 *
 * Hard-deletes (not soft-deletes) all transient data:
 *   - bookings + segments + status events + facility selections + psp_intents
 *   - events + ticket types/addons/bundles/discounts/orders/tickets
 *   - tenancies + agreements + sessions + invoices + fake DD sessions
 *   - organisations + contacts + organisation_contacts
 *   - customers
 *   - non-admin/non-staff users (and their cascading sessions/passkeys/accounts)
 *   - file rows tied to deleted entities (ticket-qr, invoice-pdf,
 *     tenancy-agreement, event-hero, event-gallery)
 *
 * KEEPS:
 *   - venue + settings + email templates
 *   - rooms + room images + content blocks + capacity layouts + facility
 *     packages + booking types + pricing rules + deposit policy + discounts
 *   - room blockouts (church recurring services, venue closures, etc)
 *   - admin / staff users + their roles + sessions (so you stay logged in)
 *   - role + permission tables (RBAC config)
 *   - expenses + expense categories + recurring costs
 *   - bank accounts + bank transactions + bank balance snapshots
 *   - POS daily takings + manual income
 *   - VAT rate
 *
 * Idempotent: re-running on an already-empty schema is a no-op.
 * Runs inside a transaction; if anything trips, nothing changes.
 *
 * Usage:  node --env-file=.env scripts/reset.mjs
 *
 * Use --dry to print row counts without deleting.
 */

import { sql } from "drizzle-orm";
import { db, client } from "../src/db/index.js";

const DRY = process.argv.includes("--dry");

// Deepest-child first. We use DELETE (not TRUNCATE) so `ON DELETE SET
// NULL` FKs are respected - preserved tables (e.g. expense, manual_income,
// bank_transaction) that hold `linked_booking_id` / `linked_event_id`
// keep their rows with those columns nulled out, instead of getting
// wiped by TRUNCATE CASCADE.
const TRANSIENT_TABLES = [
	// Ticketing (children first)
	"ticket",
	"ticket_order_line",
	"ticket_order",
	"ticket_bundle_item",
	"ticket_bundle",
	"ticket_discount_type",
	"ticket_discount",
	"ticket_type_addon",
	"ticket_addon",
	"ticket_addon_group",
	"ticket_type",
	// Events
	"event_faq",
	"event_room",
	"user_event_organiser",
	"event_organiser",
	"event",
	// Bookings
	"psp_intent",
	"booking_status_event",
	"booking_facility_selection",
	"booking_segment",
	"booking",
	// Tenancies
	"fake_dd_session",
	"tenancy_invoice",
	"tenancy_session",
	"tenancy_agreement",
	"tenancy",
	// CRM
	"organisation_contact",
	"organisation",
	"contact",
	"customer",
];

const TRANSIENT_FILE_TYPES = [
	"ticket-qr",
	"invoice-pdf",
	"tenancy-agreement",
	"event-hero",
	"event-gallery",
];

async function countAll() {
	const lines = await Promise.all(
		TRANSIENT_TABLES.map(async (t) => {
			const r = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM "${t}"`));
			return { table: t, n: (r.rows ?? r)[0].n };
		}),
	);
	const files = await db.execute(sql`
		SELECT COUNT(*)::int AS n FROM file
		WHERE file_type IN ('ticket-qr','invoice-pdf','tenancy-agreement','event-hero','event-gallery')
	`);
	const users = await db.execute(sql`
		SELECT COUNT(*)::int AS n FROM "user"
		WHERE id NOT IN (
			SELECT DISTINCT u.id FROM "user" u
			JOIN user_role ur ON ur.user_id = u.id
			JOIN role r ON r.id = ur.role_id
			WHERE r.key IN ('admin', 'staff')
		)
	`);
	return {
		tables: lines,
		files: (files.rows ?? files)[0].n,
		users: (users.rows ?? users)[0].n,
	};
}

async function preserved() {
	const r = await db.execute(sql`
		SELECT
			(SELECT COUNT(*)::int FROM venue) AS venues,
			(SELECT COUNT(*)::int FROM room) AS rooms,
			(SELECT COUNT(*)::int FROM expense) AS expenses,
			(SELECT COUNT(*)::int FROM bank_account) AS bank_accounts,
			(SELECT COUNT(*)::int FROM bank_transaction) AS bank_transactions,
			(SELECT COUNT(*)::int FROM room_blockout) AS room_blockouts,
			(SELECT COUNT(*)::int FROM "user" u WHERE EXISTS (
				SELECT 1 FROM user_role ur JOIN role r ON r.id = ur.role_id
				WHERE ur.user_id = u.id AND r.key IN ('admin','staff')
			)) AS admins
	`);
	return (r.rows ?? r)[0];
}

function fmtTable(rows) {
	const wide = Math.max(...rows.map((r) => r.table.length));
	return rows
		.map((r) => `  ${r.table.padEnd(wide)}  ${String(r.n).padStart(6)}`)
		.join("\n");
}

try {
	console.log(DRY ? "DRY RUN - no rows will be deleted." : "RESET - deleting transient data.");
	console.log();

	const before = await countAll();
	const keep = await preserved();
	const totalTransient =
		before.tables.reduce((s, r) => s + r.n, 0) + before.files + before.users;

	console.log("Transient rows to delete:");
	console.log(fmtTable(before.tables));
	console.log(`  ${"file (5 transient types)".padEnd(28)}  ${String(before.files).padStart(6)}`);
	console.log(`  ${"non-admin user".padEnd(28)}  ${String(before.users).padStart(6)}`);
	console.log(`  ${"TOTAL".padEnd(28)}  ${String(totalTransient).padStart(6)}`);
	console.log();

	console.log("Preserved:");
	for (const [k, v] of Object.entries(keep)) {
		console.log(`  ${String(k).padEnd(28)}  ${String(v).padStart(6)}`);
	}
	console.log();

	if (DRY) {
		console.log("(--dry) Skipping deletes.");
		process.exit(0);
	}

	if (totalTransient === 0) {
		console.log("Nothing to delete - already clean.");
		process.exit(0);
	}

	// Single transaction. The TRUNCATE handles every cascade; the explicit
	// list above is just documentation of every table we expect to be
	// emptied. If a new transient table gets added later, add it to the
	// constant.
	await db.transaction(async (tx) => {
		// DELETE per table in dependency order. DELETE follows ON DELETE
		// SET NULL on inbound FKs from preserved tables (expense.linked_*,
		// manual_income.linked_*, etc), so those rows survive with the
		// link nulled.
		for (const t of TRANSIENT_TABLES) {
			await tx.execute(sql.raw(`DELETE FROM "${t}"`));
		}

		await tx.execute(sql`
			DELETE FROM file
			WHERE file_type IN ('ticket-qr','invoice-pdf','tenancy-agreement','event-hero','event-gallery')
		`);

		// Non-admin users. user_role / account / session / passkey /
		// verification all cascade from user, so deleting the user is enough.
		await tx.execute(sql`
			DELETE FROM "user"
			WHERE id NOT IN (
				SELECT DISTINCT u.id FROM "user" u
				JOIN user_role ur ON ur.user_id = u.id
				JOIN role r ON r.id = ur.role_id
				WHERE r.key IN ('admin', 'staff')
			)
		`);
	});

	console.log("Done.");
	const after = await countAll();
	const totalLeft =
		after.tables.reduce((s, r) => s + r.n, 0) + after.files + after.users;
	console.log(`Remaining transient rows: ${totalLeft}`);
} finally {
	await client.end();
}
