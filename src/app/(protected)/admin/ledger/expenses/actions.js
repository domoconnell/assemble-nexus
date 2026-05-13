"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/index.js";
import { expense } from "@/db/schema/entities/expense.js";
import { expense_category } from "@/db/schema/entities/expense_category.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

async function gate() {
	return requireServerSession();
}

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

const ExpenseSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	expense_category_id: z.string().uuid().optional().nullable(),
	description: z.string().min(1).max(500),
	amount_pounds: z.coerce.number().min(0),
	// Input VAT — pounds (so the form mirrors `amount_pounds`). Optional;
	// defaults to 0 when the supplier isn't VAT-registered.
	vat_pounds: z.coerce.number().min(0).optional().default(0),
	supplier_name: z.string().max(200).optional().nullable(),
	attachment_file_id: z.string().uuid().optional().nullable(),
	linked_event_id: z.string().uuid().optional().nullable(),
	linked_booking_id: z.string().uuid().optional().nullable(),
	notes: z.string().max(2000).optional().nullable(),
}).refine(
	(d) => d.vat_pounds <= d.amount_pounds + 0.001,
	{ message: "VAT can't exceed the total amount.", path: ["vat_pounds"] },
);

export async function saveExpenseAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = ExpenseSchema.parse({
		...input,
		expense_category_id: nullify(input.expense_category_id),
		supplier_name: nullify(input.supplier_name),
		attachment_file_id: nullify(input.attachment_file_id),
		linked_event_id: nullify(input.linked_event_id),
		linked_booking_id: nullify(input.linked_booking_id),
		notes: nullify(input.notes),
	});

	const values = {
		venue_id: venue.id,
		date: parsed.date,
		expense_category_id: parsed.expense_category_id,
		description: parsed.description,
		amount_cents: Math.round(parsed.amount_pounds * 100),
		vat_cents: Math.round((parsed.vat_pounds ?? 0) * 100),
		supplier_name: parsed.supplier_name,
		attachment_file_id: parsed.attachment_file_id,
		linked_event_id: parsed.linked_event_id,
		linked_booking_id: parsed.linked_booking_id,
		notes: parsed.notes,
	};

	if (parsed.id) {
		await db
			.update(expense)
			.set(values)
			.where(and(eq(expense.id, parsed.id), eq(expense.venue_id, venue.id)));
	} else {
		await db.insert(expense).values(values);
	}

	revalidatePath("/admin/ledger/expenses");
	revalidatePath("/admin/ledger");
	return { ok: true };
}

export async function deleteExpenseAction(id) {
	await gate();
	const venue = await requireCurrentVenue();
	await db
		.update(expense)
		.set({ deletedAt: new Date() })
		.where(and(eq(expense.id, id), eq(expense.venue_id, venue.id)));
	revalidatePath("/admin/ledger/expenses");
	revalidatePath("/admin/ledger");
	return { ok: true };
}

const CategorySchema = z.object({
	id: z.string().uuid().optional().nullable(),
	name: z.string().min(1).max(80),
	key: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
	is_cost_of_delivery: z.coerce.boolean().optional().default(true),
	sort_order: z.coerce.number().int().optional().default(50),
});

export async function saveExpenseCategoryAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = CategorySchema.parse(input);
	const values = {
		venue_id: venue.id,
		key: parsed.key,
		name: parsed.name,
		is_cost_of_delivery: !!parsed.is_cost_of_delivery,
		sort_order: parsed.sort_order,
	};
	if (parsed.id) {
		await db
			.update(expense_category)
			.set(values)
			.where(and(eq(expense_category.id, parsed.id), eq(expense_category.venue_id, venue.id)));
	} else {
		await db.insert(expense_category).values(values);
	}
	revalidatePath("/admin/ledger/expenses");
	return { ok: true };
}

export async function deleteExpenseCategoryAction(id) {
	await gate();
	const venue = await requireCurrentVenue();
	await db
		.update(expense_category)
		.set({ deletedAt: new Date() })
		.where(and(eq(expense_category.id, id), eq(expense_category.venue_id, venue.id)));
	revalidatePath("/admin/ledger/expenses");
	return { ok: true };
}
