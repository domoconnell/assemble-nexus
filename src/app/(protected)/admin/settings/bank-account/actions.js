"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveSetting, getStarlingSettings } from "@/db/queries/settings.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { probeStarling, listStarlingAccounts } from "@/lib/finance/starling.js";
import { syncStarlingForVenue } from "@/lib/finance/bank-sync.js";

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
}

const SaveSchema = z.object({
	access_token: z.string().min(1).max(2000).optional().nullable(),
	account_uid: z
		.string()
		.regex(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
			"Account UID must be a UUID (Starling shows it in the API → Account section).",
		),
	account_label: z.string().max(120).optional().nullable(),
});

/**
 * Save Starling credentials for the current venue. `access_token` is
 * optional on subsequent saves (so admins can update the account UID or
 * label without re-pasting the token) — when absent, the existing token is
 * kept.
 */
export async function saveStarlingSettingsAction(input) {
	await gate();
	const parsed = SaveSchema.parse(input);
	const venue = await requireCurrentVenue();

	const existing = (await getStarlingSettings(venue.id)) ?? {};
	const access_token = parsed.access_token?.trim() || existing.access_token || null;
	if (!access_token) {
		throw new Error("Paste a Personal Access Token the first time you save.");
	}

	// Look up the account's `defaultCategory` UID (Starling's transactions
	// endpoint is keyed by category, not account). Saved alongside so the
	// sync service can run without an extra lookup each pass.
	let default_category = existing.default_category ?? null;
	if (!default_category || parsed.account_uid !== existing.account_uid) {
		const lookup = await listStarlingAccounts(access_token);
		if (lookup.ok) {
			const match = lookup.accounts.find((a) => a.accountUid === parsed.account_uid);
			default_category = match?.defaultCategory ?? null;
		}
	}

	await saveSetting(venue.id, "starling", {
		access_token,
		account_uid: parsed.account_uid,
		account_label: parsed.account_label ?? existing.account_label ?? null,
		default_category,
		last_synced_at: existing.last_synced_at ?? null,
		updated_at: new Date().toISOString(),
	});

	revalidatePath("/admin/settings/bank-account");
	revalidatePath("/admin/ledger/overview");
	return { ok: true };
}

export async function clearStarlingSettingsAction() {
	await gate();
	const venue = await requireCurrentVenue();
	await saveSetting(venue.id, "starling", null);
	revalidatePath("/admin/settings/bank-account");
	revalidatePath("/admin/ledger/overview");
	return { ok: true };
}

const TestSchema = z.object({
	access_token: z.string().min(1).optional().nullable(),
	account_uid: z.string().min(1),
});

/**
 * Hit Starling's balance endpoint with the supplied creds (falling back to
 * the saved token if the form left the token blank) and return ok/error.
 * Used by the editor's "Test connection" button.
 */
export async function testStarlingSettingsAction(input) {
	await gate();
	const parsed = TestSchema.parse(input);
	const venue = await requireCurrentVenue();
	const existing = (await getStarlingSettings(venue.id)) ?? {};
	const token = parsed.access_token?.trim() || existing.access_token || null;
	const result = await probeStarling({ token, accountUid: parsed.account_uid });
	return result;
}

/**
 * Manual "Sync now" trigger from the bank-account settings page. When
 * `force` is true, ignores `last_synced_at` and pulls the full backfill
 * window — useful on first setup.
 */
export async function syncStarlingNowAction({ force = false } = {}) {
	await gate();
	const venue = await requireCurrentVenue();
	const result = await syncStarlingForVenue(venue.id, { force });
	revalidatePath("/admin/settings/bank-account");
	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin");
	return result;
}
