"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { saveSetting, getStripeSettings } from "@/db/queries/settings.js";
import { probeStripe } from "@/lib/psp/stripe.js";

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
}

const ProviderSchema = z.object({
	provider: z.enum(["fake", "stripe"]),
});

export async function savePaymentsSettingsAction(input) {
	await gate();
	const parsed = ProviderSchema.parse(input);
	const venue = await requireCurrentVenue();
	await saveSetting(venue.id, "payments", { provider: parsed.provider });
	revalidatePath("/admin/settings/payments");
	revalidatePath("/admin/settings");
}

const StripeSchema = z.object({
	secret_key: z.string().min(1).max(2000).optional().nullable(),
	publishable_key: z.string().min(1).max(2000).optional().nullable(),
	webhook_signing_secret: z.string().max(2000).optional().nullable(),
});

/**
 * Persist Stripe credentials. `secret_key` is optional on resaves so the
 * admin can update the publishable key or webhook secret without
 * re-pasting the long sk_… string. Environment (live/test) is derived
 * from the secret key's prefix on save.
 */
export async function saveStripeSettingsAction(input) {
	await gate();
	const parsed = StripeSchema.parse(input);
	const venue = await requireCurrentVenue();
	const existing = (await getStripeSettings(venue.id)) ?? {};
	const secret_key = parsed.secret_key?.trim() || existing.secret_key || null;
	if (!secret_key) {
		throw new Error("Paste a secret key the first time you save.");
	}
	const environment = secret_key.startsWith("sk_live_") ? "live" : "test";
	await saveSetting(venue.id, "stripe", {
		secret_key,
		publishable_key: parsed.publishable_key?.trim() || existing.publishable_key || null,
		webhook_signing_secret:
			parsed.webhook_signing_secret?.trim() || existing.webhook_signing_secret || null,
		environment,
		updated_at: new Date().toISOString(),
	});
	revalidatePath("/admin/settings/payments");
	return { ok: true, environment };
}

export async function clearStripeSettingsAction() {
	await gate();
	const venue = await requireCurrentVenue();
	await saveSetting(venue.id, "stripe", null);
	revalidatePath("/admin/settings/payments");
	return { ok: true };
}

const TestSchema = z.object({
	secret_key: z.string().min(1).optional().nullable(),
});

export async function testStripeSettingsAction(input) {
	await gate();
	const parsed = TestSchema.parse(input);
	const venue = await requireCurrentVenue();
	const existing = (await getStripeSettings(venue.id)) ?? {};
	const secret_key = parsed.secret_key?.trim() || existing.secret_key || null;
	return probeStripe({ secret_key });
}
