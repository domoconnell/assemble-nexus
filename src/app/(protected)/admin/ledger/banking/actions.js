"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/index.js";
import { bank_transaction } from "@/db/schema/entities/bank_transaction.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

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
