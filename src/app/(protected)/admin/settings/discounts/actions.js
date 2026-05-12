"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/index.js";
import { discount } from "@/db/schema/entities/discount.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

const Schema = z.object({
	id: z.string().uuid().optional().nullable(),
	label: z.string().min(1).max(160),
	description: z.string().max(500).optional().nullable(),
	percent_x100: z.coerce.number().int().min(0).max(10000),
	sort_order: z.coerce.number().int().optional().default(0),
	is_active: z.coerce.boolean().optional().default(true),
});

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
}

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

export async function saveDiscountAction(input) {
	await gate();
	const parsed = Schema.parse({ ...input, description: nullify(input.description) });
	const venue = await requireCurrentVenue();

	const values = {
		venue_id: venue.id,
		label: parsed.label,
		description: parsed.description ?? null,
		percent_x100: parsed.percent_x100,
		applies_to: "room_hire",
		sort_order: parsed.sort_order ?? 0,
		is_active: !!parsed.is_active,
	};

	let result;
	if (parsed.id) {
		[result] = await db.update(discount).set(values).where(eq(discount.id, parsed.id)).returning();
	} else {
		[result] = await db.insert(discount).values(values).returning();
	}

	revalidatePath("/admin/settings/discounts");
	return result;
}

export async function deleteDiscountAction(id) {
	await gate();
	await db.update(discount).set({ deletedAt: new Date(), is_active: false }).where(eq(discount.id, id));
	revalidatePath("/admin/settings/discounts");
}
