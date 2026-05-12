"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveSetting } from "@/db/queries/settings.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

const hmmRegex = /^([01]\d|2[0-4]):[0-5]\d$/;

const BandSchema = z.object({
	label: z.string().min(1).max(80),
	from: z.string().regex(hmmRegex),
	to: z.string().regex(hmmRegex),
	modifier_x100: z.coerce.number().int().min(0).max(50000),
});

const BodySchema = z.object({
	bands: z.array(BandSchema).min(1).max(12),
});

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
}

export async function saveHourlyBandsAction(input) {
	await gate();
	const parsed = BodySchema.parse(input);
	const sorted = [...parsed.bands].sort((a, b) => a.from.localeCompare(b.from));
	for (let i = 0; i < sorted.length; i++) {
		if (sorted[i].from >= sorted[i].to) {
			throw new Error(`Band "${sorted[i].label}" has from ≥ to.`);
		}
		if (i > 0 && sorted[i].from < sorted[i - 1].to) {
			throw new Error("Bands must not overlap.");
		}
	}
	const venue = await requireCurrentVenue();
	await saveSetting(venue.id, "hourly_bands", { bands: sorted });
	revalidatePath("/admin/settings/hours");
	return { bands: sorted };
}
