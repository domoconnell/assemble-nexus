"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveSetting } from "@/db/queries/settings.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

const Schema = z.object({
	platform_fee_pct_x100: z.coerce.number().int().min(0).max(10000),
	platform_fee_flat_cents: z.coerce.number().int().min(0).max(1000000),
});

export async function saveTicketingSettingsAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = Schema.parse(input);
	const venue = await requireCurrentVenue();
	await saveSetting(venue.id, "ticketing", parsed);
	revalidatePath("/admin/settings/ticketing");
	return parsed;
}
