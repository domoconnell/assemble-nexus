"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveSetting } from "@/db/queries/settings.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

const Schema = z.object({
	html: z.string().max(200000),
});

export async function saveTenancyAgreementTemplateAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = Schema.parse(input);
	const venue = await requireCurrentVenue();
	await saveSetting(venue.id, "tenancy_agreement", { html: parsed.html });
	revalidatePath("/admin/settings/tenancy-agreements");
	return { ok: true };
}
