"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue, updateVenueProfile } from "@/db/queries/venue.js";

const Schema = z.object({
	name: z.string().min(1).max(200),
	address_lines: z.array(z.string().max(200)).max(8).optional(),
	timezone: z.string().min(1).max(80).optional(),
	phone: z.string().max(40).optional().nullable(),
	contact_email: z
		.string()
		.email()
		.max(200)
		.optional()
		.or(z.literal(""))
		.transform((v) => (v === "" ? null : v)),
	sendgrid_from_email: z
		.string()
		.email()
		.max(200)
		.optional()
		.or(z.literal(""))
		.transform((v) => (v === "" ? null : v)),
});

export async function saveVenueProfileAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = Schema.parse(input);
	const venue = await requireCurrentVenue();
	const patch = {
		name: parsed.name.trim(),
		address_lines: (parsed.address_lines ?? []).map((s) => s.trim()).filter(Boolean),
		timezone: parsed.timezone?.trim() || "Europe/London",
		phone: parsed.phone?.trim() || null,
		contact_email: parsed.contact_email ?? null,
		sendgrid_from_email: parsed.sendgrid_from_email ?? null,
	};
	const updated = await updateVenueProfile(venue.id, patch);
	revalidatePath("/admin/settings/venue");
	revalidatePath("/admin/settings");
	return updated;
}
