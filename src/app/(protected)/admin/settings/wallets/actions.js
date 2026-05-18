"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
	saveSetting,
	getAppleWalletSettings,
	getGoogleWalletSettings,
} from "@/db/queries/settings.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { p12ToPem } from "@/lib/wallets/apple/extract-pem.js";

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
}

const AppleWalletSchema = z.object({
	pass_type_identifier: z.string().min(1).max(200),
	team_identifier: z.string().min(1).max(40),
	organisation_name: z.string().min(1).max(200),
	p12_base64: z.string().optional().nullable(),
	p12_passphrase: z.string().optional().nullable(),
});

export async function saveAppleWalletSettingsAction(input) {
	await gate();
	const parsed = AppleWalletSchema.parse(input);
	const venue = await requireCurrentVenue();

	const existing = (await getAppleWalletSettings(venue.id)) ?? {};
	let signer_cert_pem = existing.signer_cert_pem ?? null;
	let signer_key_pem = existing.signer_key_pem ?? null;

	if (parsed.p12_base64) {
		const { certPem, keyPem } = p12ToPem(
			parsed.p12_base64,
			parsed.p12_passphrase ?? "",
		);
		signer_cert_pem = certPem;
		signer_key_pem = keyPem;
	}

	const value = {
		pass_type_identifier: parsed.pass_type_identifier.trim(),
		team_identifier: parsed.team_identifier.trim(),
		organisation_name: parsed.organisation_name.trim(),
		signer_cert_pem,
		signer_key_pem,
		uploaded_at: parsed.p12_base64 ? new Date().toISOString() : existing.uploaded_at ?? null,
	};

	await saveSetting(venue.id, "apple_wallet", value);
	revalidatePath("/admin/settings/wallets");
	return { ok: true, uploaded_at: value.uploaded_at };
}

export async function clearAppleWalletSettingsAction() {
	await gate();
	const venue = await requireCurrentVenue();
	await saveSetting(venue.id, "apple_wallet", null);
	revalidatePath("/admin/settings/wallets");
	return { ok: true };
}

const GoogleWalletSchema = z.object({
	issuer_id: z.string().min(1).max(80),
	class_suffix: z.string().min(1).max(80).optional().nullable(),
	service_account_json: z.string().optional().nullable(),
});

export async function saveGoogleWalletSettingsAction(input) {
	await gate();
	const parsed = GoogleWalletSchema.parse(input);
	const venue = await requireCurrentVenue();

	const existing = (await getGoogleWalletSettings(venue.id)) ?? {};
	let service_account_json = existing.service_account_json ?? null;
	if (parsed.service_account_json) {
		try {
			JSON.parse(parsed.service_account_json);
		} catch {
			throw new Error("Service account JSON isn't valid JSON.");
		}
		service_account_json = parsed.service_account_json;
	}

	const value = {
		issuer_id: parsed.issuer_id.trim(),
		class_suffix: parsed.class_suffix?.trim() || "ticket",
		service_account_json,
		uploaded_at: parsed.service_account_json
			? new Date().toISOString()
			: existing.uploaded_at ?? null,
	};
	await saveSetting(venue.id, "google_wallet", value);
	revalidatePath("/admin/settings/wallets");
	return { ok: true, uploaded_at: value.uploaded_at };
}

export async function clearGoogleWalletSettingsAction() {
	await gate();
	const venue = await requireCurrentVenue();
	await saveSetting(venue.id, "google_wallet", null);
	revalidatePath("/admin/settings/wallets");
	return { ok: true };
}
