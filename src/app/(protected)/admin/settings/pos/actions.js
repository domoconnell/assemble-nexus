"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveSetting, getSquareSettings } from "@/db/queries/settings.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { probeSquare } from "@/lib/finance/square.js";

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
}

const SaveSchema = z.object({
	access_token: z.string().min(1).max(2000).optional().nullable(),
	location_id: z.string().min(1).max(200),
	environment: z.enum(["sandbox", "production"]),
	location_label: z.string().max(120).optional().nullable(),
});

export async function saveSquareSettingsAction(input) {
	await gate();
	const parsed = SaveSchema.parse(input);
	const venue = await requireCurrentVenue();
	const existing = (await getSquareSettings(venue.id)) ?? {};
	const access_token = parsed.access_token?.trim() || existing.access_token || null;
	if (!access_token) {
		throw new Error("Paste a Square access token the first time you save.");
	}
	await saveSetting(venue.id, "square", {
		access_token,
		location_id: parsed.location_id,
		environment: parsed.environment,
		location_label: parsed.location_label ?? existing.location_label ?? null,
		updated_at: new Date().toISOString(),
	});
	revalidatePath("/admin/settings/pos");
	revalidatePath("/admin/ledger/pos");
	return { ok: true };
}

export async function clearSquareSettingsAction() {
	await gate();
	const venue = await requireCurrentVenue();
	await saveSetting(venue.id, "square", null);
	revalidatePath("/admin/settings/pos");
	revalidatePath("/admin/ledger/pos");
	return { ok: true };
}

const TestSchema = z.object({
	access_token: z.string().min(1).optional().nullable(),
	location_id: z.string().min(1),
	environment: z.enum(["sandbox", "production"]),
});

export async function testSquareSettingsAction(input) {
	await gate();
	const parsed = TestSchema.parse(input);
	const venue = await requireCurrentVenue();
	const existing = (await getSquareSettings(venue.id)) ?? {};
	return probeSquare({
		access_token: parsed.access_token?.trim() || existing.access_token,
		location_id: parsed.location_id,
		environment: parsed.environment,
	});
}
