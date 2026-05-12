"use server";

import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/index.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+|_[a-z0-9]+)*$/;

const Schema = z.object({
	id: z.string().uuid().optional().nullable(),
	key: z.string().min(1).max(80).regex(slugRegex, "Use lowercase letters, numbers, dashes or underscores."),
	label: z.string().min(1).max(120),
	description: z.string().max(500).optional().nullable(),
	default_rate_modifier_x100: z.coerce.number().int().min(0).max(50000),
	sort_order: z.coerce.number().int().optional().default(0),
});

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
}

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

export async function saveBookingTypeAction(input) {
	await gate();
	const parsed = Schema.parse({ ...input, description: nullify(input.description) });
	const values = {
		key: parsed.key,
		label: parsed.label,
		description: parsed.description ?? null,
		default_rate_modifier_x100: parsed.default_rate_modifier_x100,
		sort_order: parsed.sort_order ?? 0,
	};
	let result;
	if (parsed.id) {
		[result] = await db.update(booking_type).set(values).where(eq(booking_type.id, parsed.id)).returning();
	} else {
		[result] = await db.insert(booking_type).values(values).returning();
	}
	revalidatePath("/admin/settings/booking-types");
	return result;
}

export async function deleteBookingTypeAction(id) {
	await gate();
	await db.update(booking_type).set({ deletedAt: new Date() }).where(eq(booking_type.id, id));
	revalidatePath("/admin/settings/booking-types");
}
