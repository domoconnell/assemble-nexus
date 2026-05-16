"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/index.js";
import { recurring_cost_schedule, RECURRING_COST_TYPES } from "@/db/schema/entities/recurring_cost_schedule.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

async function gate() {
	return requireServerSession();
}

function pad(n) {
	return String(n).padStart(2, "0");
}

// Coerce a 'YYYY-MM' input into the first of that month as 'YYYY-MM-DD'.
function firstOfMonth(ym) {
	const m = /^(\d{4})-(\d{2})$/.exec(ym);
	if (!m) throw new Error("Invalid month - expected YYYY-MM");
	const year = Number(m[1]);
	const month = Number(m[2]);
	if (month < 1 || month > 12) throw new Error("Invalid month");
	return `${year}-${pad(month)}-01`;
}

const SetScheduleSchema = z.object({
	type: z.enum(RECURRING_COST_TYPES),
	effective_from_ym: z.string().regex(/^\d{4}-\d{2}$/),
	amount_pounds: z.coerce.number().min(0),
	notes: z.string().max(500).optional().nullable(),
});

export async function setRecurringCostScheduleAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = SetScheduleSchema.parse(input);
	const effective_from = firstOfMonth(parsed.effective_from_ym);
	const amount_cents = Math.round(parsed.amount_pounds * 100);

	// If there's already a row for this venue/type/effective_from, update it.
	// Otherwise insert. This keeps the history clean - multiple edits to the
	// same starting month don't pile up duplicate rows.
	const [existing] = await db
		.select({ id: recurring_cost_schedule.id })
		.from(recurring_cost_schedule)
		.where(
			and(
				eq(recurring_cost_schedule.venue_id, venue.id),
				eq(recurring_cost_schedule.type, parsed.type),
				eq(recurring_cost_schedule.effective_from, effective_from),
			),
		)
		.limit(1);

	if (existing) {
		await db
			.update(recurring_cost_schedule)
			.set({ monthly_amount_cents: amount_cents, notes: parsed.notes ?? null })
			.where(eq(recurring_cost_schedule.id, existing.id));
	} else {
		await db.insert(recurring_cost_schedule).values({
			venue_id: venue.id,
			type: parsed.type,
			effective_from,
			monthly_amount_cents: amount_cents,
			notes: parsed.notes ?? null,
		});
	}

	revalidatePath("/admin/ledger/recurring");
	revalidatePath("/admin/ledger");
	return { ok: true };
}

export async function deleteRecurringCostScheduleAction(id) {
	await gate();
	const venue = await requireCurrentVenue();
	await db
		.delete(recurring_cost_schedule)
		.where(
			and(
				eq(recurring_cost_schedule.id, id),
				eq(recurring_cost_schedule.venue_id, venue.id),
			),
		);
	revalidatePath("/admin/ledger/recurring");
	revalidatePath("/admin/ledger");
	return { ok: true };
}
