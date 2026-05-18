"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue, updateVenueProfile } from "@/db/queries/venue.js";

const Schema = z.object({
	name: z.string().min(1).max(200),
});

export async function saveVenueProfileAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = Schema.parse(input);
	const venue = await requireCurrentVenue();
	const updated = await updateVenueProfile(venue.id, { name: parsed.name.trim() });
	revalidatePath("/admin/settings/venue");
	revalidatePath("/admin/settings");
	return { name: updated.name };
}
