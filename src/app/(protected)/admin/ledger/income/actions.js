"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/index.js";
import { manual_income, MANUAL_INCOME_KINDS } from "@/db/schema/entities/manual_income.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

async function gate() {
	return requireServerSession();
}

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

const IncomeSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	kind: z.enum(MANUAL_INCOME_KINDS),
	description: z.string().min(1).max(500),
	amount_pounds: z.coerce.number().min(0),
	// Output VAT portion of `amount_pounds` (gross-inclusive). Defaults
	// to 0 for donations / outside-the-scope rows.
	vat_pounds: z.coerce.number().min(0).optional().default(0),
	notes: z.string().max(2000).optional().nullable(),
});

export async function saveManualIncomeAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = IncomeSchema.parse({
		...input,
		notes: nullify(input.notes),
	});

	const values = {
		venue_id: venue.id,
		date: parsed.date,
		kind: parsed.kind,
		description: parsed.description,
		amount_cents: Math.round(parsed.amount_pounds * 100),
		vat_cents: Math.round((parsed.vat_pounds ?? 0) * 100),
		notes: parsed.notes,
	};

	if (parsed.id) {
		await db
			.update(manual_income)
			.set(values)
			.where(and(eq(manual_income.id, parsed.id), eq(manual_income.venue_id, venue.id)));
	} else {
		await db.insert(manual_income).values(values);
	}

	revalidatePath("/admin/ledger/income");
	revalidatePath("/admin/ledger");
	return { ok: true };
}

export async function deleteManualIncomeAction(id) {
	await gate();
	const venue = await requireCurrentVenue();
	await db
		.update(manual_income)
		.set({ deletedAt: new Date() })
		.where(and(eq(manual_income.id, id), eq(manual_income.venue_id, venue.id)));
	revalidatePath("/admin/ledger/income");
	revalidatePath("/admin/ledger");
	return { ok: true };
}
