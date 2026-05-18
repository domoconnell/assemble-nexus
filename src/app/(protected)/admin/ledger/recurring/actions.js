"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import {
	insertRecurringCostItem,
	updateRecurringCostItem,
	softDeleteRecurringCostItem,
	insertScheduleEntry,
	deleteScheduleEntry,
} from "@/db/queries/finance.js";
import { RECURRING_COST_TYPES } from "@/db/schema/entities/recurring_cost_schedule.js";

async function gate() {
	await requireServerSession();
	return requireCurrentVenue();
}

function pad(n) {
	return String(n).padStart(2, "0");
}

function firstOfMonth(ym) {
	const m = /^(\d{4})-(\d{2})$/.exec(ym);
	if (!m) throw new Error("Invalid month - expected YYYY-MM");
	const year = Number(m[1]);
	const month = Number(m[2]);
	if (month < 1 || month > 12) throw new Error("Invalid month");
	return `${year}-${pad(month)}-01`;
}

const CreateItemSchema = z.object({
	type: z.enum(RECURRING_COST_TYPES),
	label: z.string().min(1).max(120),
	initial_amount_pounds: z.coerce.number().min(0),
	initial_effective_from_ym: z.string().regex(/^\d{4}-\d{2}$/),
	sort_order: z.coerce.number().int().optional().default(0),
});

export async function createRecurringCostItemAction(input) {
	const venue = await gate();
	const parsed = CreateItemSchema.parse(input);
	const item = await insertRecurringCostItem({
		venue_id: venue.id,
		type: parsed.type,
		label: parsed.label.trim(),
		sort_order: parsed.sort_order ?? 0,
	});
	await insertScheduleEntry({
		venue_id: venue.id,
		item_id: item.id,
		type: parsed.type,
		effective_from: firstOfMonth(parsed.initial_effective_from_ym),
		monthly_amount_cents: Math.round(parsed.initial_amount_pounds * 100),
	});
	revalidatePath("/admin/ledger/recurring");
	revalidatePath("/admin/ledger");
	return { id: item.id };
}

const RenameItemSchema = z.object({
	id: z.string().uuid(),
	label: z.string().min(1).max(120),
});

export async function renameRecurringCostItemAction(input) {
	await gate();
	const parsed = RenameItemSchema.parse(input);
	await updateRecurringCostItem(parsed.id, { label: parsed.label.trim() });
	revalidatePath("/admin/ledger/recurring");
	revalidatePath("/admin/ledger");
	return { ok: true };
}

export async function deleteRecurringCostItemAction(id) {
	await gate();
	await softDeleteRecurringCostItem(id);
	revalidatePath("/admin/ledger/recurring");
	revalidatePath("/admin/ledger");
	return { ok: true };
}

const AddScheduleSchema = z.object({
	item_id: z.string().uuid(),
	type: z.enum(RECURRING_COST_TYPES),
	effective_from_ym: z.string().regex(/^\d{4}-\d{2}$/),
	amount_pounds: z.coerce.number().min(0),
	notes: z.string().max(500).optional().nullable(),
});

export async function addScheduleEntryAction(input) {
	const venue = await gate();
	const parsed = AddScheduleSchema.parse(input);
	await insertScheduleEntry({
		venue_id: venue.id,
		item_id: parsed.item_id,
		type: parsed.type,
		effective_from: firstOfMonth(parsed.effective_from_ym),
		monthly_amount_cents: Math.round(parsed.amount_pounds * 100),
		notes: parsed.notes?.trim() || null,
	});
	revalidatePath("/admin/ledger/recurring");
	revalidatePath("/admin/ledger");
	return { ok: true };
}

export async function deleteScheduleEntryAction(id) {
	await gate();
	await deleteScheduleEntry(id);
	revalidatePath("/admin/ledger/recurring");
	revalidatePath("/admin/ledger");
	return { ok: true };
}
