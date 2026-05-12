"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/index.js";
import { booking_agreement } from "@/db/schema/entities/booking_agreement.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

const SectionSchema = z.object({
	heading: z.string().min(1).max(200),
	paragraphs: z.array(z.string().max(4000)).min(0),
});

const Schema = z.object({
	id: z.string().uuid().optional().nullable(),
	title: z.string().min(1).max(200),
	intro: z.string().max(2000).optional().nullable(),
	sections: z.array(SectionSchema).default([]),
	version: z.string().max(80).optional().nullable(),
});

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
}

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

export async function saveBookingAgreementAction(input) {
	await gate();
	const parsed = Schema.parse({
		...input,
		intro: nullify(input.intro),
		version: nullify(input.version),
		sections: (input.sections || []).map((s) => ({
			heading: s.heading ?? "",
			paragraphs: (s.paragraphs ?? []).filter((p) => p && p.trim().length > 0),
		})).filter((s) => s.heading.trim().length > 0 || s.paragraphs.length > 0),
	});

	const venue = await requireCurrentVenue();

	const values = {
		venue_id: venue.id,
		title: parsed.title,
		intro: parsed.intro ?? null,
		sections: parsed.sections,
		version: parsed.version ?? null,
		is_active: true,
	};

	let result;
	if (parsed.id) {
		[result] = await db.update(booking_agreement).set(values).where(eq(booking_agreement.id, parsed.id)).returning();
	} else {
		[result] = await db.insert(booking_agreement).values(values).returning();
	}
	revalidatePath("/admin/settings/booking-agreement");
	return result;
}
