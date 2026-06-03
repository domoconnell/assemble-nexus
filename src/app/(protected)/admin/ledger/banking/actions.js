"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/index.js";
import { bank_transaction } from "@/db/schema/entities/bank_transaction.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { runBankSync } from "@/lib/banking/sync.js";
import { autoMatchInboundTransactions } from "@/lib/banking/auto-match.js";
import { tenancy_invoice } from "@/db/schema/entities/tenancy.js";

const ToggleSchema = z.object({
	transaction_id: z.string().uuid(),
	is_church_transfer: z.boolean(),
});

/**
 * Flip a transaction's is_church_transfer flag. Used by the manual
 * override toggle on the banking transactions list - covers transactions
 * the auto-detector missed (or wrongly flagged).
 */
export async function setChurchTransferFlagAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = ToggleSchema.parse(input);
	const venue = await requireCurrentVenue();
	await db
		.update(bank_transaction)
		.set({ is_church_transfer: parsed.is_church_transfer })
		.where(
			and(
				eq(bank_transaction.id, parsed.transaction_id),
				eq(bank_transaction.venue_id, venue.id),
			),
		);
	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/ledger/overview");
	return { ok: true };
}

/**
 * Sync the venue's bank accounts on demand. Calls the SAME `runBankSync`
 * helper the nightly cron uses — pull every provider feed, then run
 * the auto-match pass that links inbound transactions to open tenancy
 * invoices and flips matched invoices to paid.
 */
export async function runBankSyncAction() {
	await requireServerSession({ redirectTo: "/auth/login" });
	const venue = await requireCurrentVenue();
	const result = await runBankSync({ venueId: venue.id });
	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/ledger/overview");
	revalidatePath("/admin/tenancies");
	revalidatePath("/admin/crm");
	return result;
}

const TxIdSchema = z.object({ transaction_id: z.string().uuid() });

/**
 * Unmatch a bank transaction. Clears the link on `bank_transaction` and,
 * when the match was to a tenancy_invoice that we'd flipped to paid,
 * flips it back to issued so it shows up as outstanding again. Booking
 * and other entity types are no-op'd until they have an equivalent
 * "paid → unpaid" flow.
 */
export async function unmatchTransactionAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = TxIdSchema.parse(input);
	const venue = await requireCurrentVenue();
	const [tx] = await db
		.select()
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.id, parsed.transaction_id),
				eq(bank_transaction.venue_id, venue.id),
			),
		)
		.limit(1);
	if (!tx) throw new Error("Transaction not found.");
	if (!tx.matched_to_id) return { ok: true, already: true };

	if (tx.matched_to_type === "tenancy_invoice") {
		await db
			.update(tenancy_invoice)
			.set({ status: "issued", paid_at: null })
			.where(eq(tenancy_invoice.id, tx.matched_to_id));
	}
	await db
		.update(bank_transaction)
		.set({ matched_to_id: null, matched_to_type: null })
		.where(eq(bank_transaction.id, tx.id));

	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/tenancies");
	revalidatePath("/admin/crm");
	return { ok: true };
}

/**
 * Rematch a single transaction. Clears any existing match (and reverts
 * the prior paid-flip), then runs the same auto-match routine the
 * Sync-now button uses against this venue. If the matcher finds a fresh
 * candidate the row is re-linked and the new invoice flipped to paid.
 *
 * The auto-matcher scans every unmatched row for the venue, not just
 * this one — that's fine because all OTHER unmatched rows would have
 * been considered on their own merits anyway and idempotency means
 * re-running the scan can only ever add matches, never break existing
 * ones.
 */
export async function rematchTransactionAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = TxIdSchema.parse(input);
	const venue = await requireCurrentVenue();
	const [tx] = await db
		.select()
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.id, parsed.transaction_id),
				eq(bank_transaction.venue_id, venue.id),
			),
		)
		.limit(1);
	if (!tx) throw new Error("Transaction not found.");

	if (tx.matched_to_id && tx.matched_to_type === "tenancy_invoice") {
		await db
			.update(tenancy_invoice)
			.set({ status: "issued", paid_at: null })
			.where(eq(tenancy_invoice.id, tx.matched_to_id));
	}
	if (tx.matched_to_id) {
		await db
			.update(bank_transaction)
			.set({ matched_to_id: null, matched_to_type: null })
			.where(eq(bank_transaction.id, tx.id));
	}

	const result = await autoMatchInboundTransactions(venue.id);
	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/tenancies");
	revalidatePath("/admin/crm");
	return { ok: true, ...result };
}
