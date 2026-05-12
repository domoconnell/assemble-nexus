"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { saveSetting } from "@/db/queries/settings.js";

const SaveSchema = z.object({
	provider: z.enum(["fake", "stripe"]),
});

export async function savePaymentsSettingsAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = SaveSchema.parse(input);
	const venue = await requireCurrentVenue();
	await saveSetting(venue.id, "payments", { provider: parsed.provider });
	revalidatePath("/admin/settings/payments");
	revalidatePath("/admin/settings");
}
