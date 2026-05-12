"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/index.js";
import { deposit_policy } from "@/db/schema/entities/deposit_policy.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

const Schema = z.object({
	id: z.string().uuid().optional().nullable(),
	deposit_pct_x100: z.coerce.number().int().min(0).max(10000),
	non_refundable_pct_x100: z.coerce.number().int().min(0).max(10000),
	refundable_until_days_before: z.coerce.number().int().min(0).max(365),
	notes: z.string().max(1000).optional().nullable(),
});

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
}

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

export async function saveDepositPolicyAction(input) {
	await gate();
	const parsed = Schema.parse({ ...input, notes: nullify(input.notes) });

	if (parsed.non_refundable_pct_x100 > parsed.deposit_pct_x100) {
		throw new Error("Non-refundable percentage can't be greater than deposit percentage.");
	}

	const venue = await requireCurrentVenue();

	const values = {
		venue_id: venue.id,
		deposit_pct_x100: parsed.deposit_pct_x100,
		non_refundable_pct_x100: parsed.non_refundable_pct_x100,
		refundable_until_days_before: parsed.refundable_until_days_before,
		notes: parsed.notes ?? null,
		is_active: true,
	};

	let result;
	if (parsed.id) {
		[result] = await db.update(deposit_policy).set(values).where(eq(deposit_policy.id, parsed.id)).returning();
	} else {
		[result] = await db.insert(deposit_policy).values(values).returning();
	}
	revalidatePath("/admin/settings/deposit-policy");
	return result;
}
