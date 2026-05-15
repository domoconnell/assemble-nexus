"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { bank_account } from "@/db/schema/entities/bank_account.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { listStarlingAccountsForToken, starlingProvider } from "@/lib/banking/providers/starling.js";
import {
	revolutProvider,
	exchangeAuthCode,
	listRevolutAccounts,
} from "@/lib/banking/providers/revolut.js";
import { syncBankAccount } from "@/lib/banking/sync.js";

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
}

function revalidate() {
	revalidatePath("/admin/settings/bank-accounts");
	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/ledger/overview");
	revalidatePath("/admin");
}

async function loadAccount(id, venueId) {
	const [row] = await db
		.select()
		.from(bank_account)
		.where(and(eq(bank_account.id, id), eq(bank_account.venue_id, venueId), isNull(bank_account.deletedAt)))
		.limit(1);
	if (!row) throw new Error("Bank account not found.");
	return row;
}

// ── Starling ───────────────────────────────────────────────────────────

const StarlingSaveSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	label: z.string().min(1).max(120),
	access_token: z.string().min(1).max(2000).optional().nullable(),
	account_uid: z.string().min(1),
});

export async function saveStarlingAccountAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = StarlingSaveSchema.parse(input);

	let existing = null;
	if (parsed.id) {
		existing = await loadAccount(parsed.id, venue.id);
	}
	const existingCreds = existing?.credentials ?? {};
	const access_token = parsed.access_token?.trim() || existingCreds.access_token;
	if (!access_token) {
		throw new Error("Paste a Personal Access Token the first time you save.");
	}

	// Resolve defaultCategory (transactions endpoint requires it) from Starling
	const lookup = await listStarlingAccountsForToken(access_token);
	if (!lookup.ok) throw new Error(lookup.error || "Starling rejected the token.");
	const match = lookup.accounts.find((a) => a.accountUid === parsed.account_uid);
	if (!match) throw new Error("Account UID not found on this token.");

	const credentials = {
		access_token,
		account_uid: parsed.account_uid,
		default_category: match.defaultCategory,
	};

	if (existing) {
		await db
			.update(bank_account)
			.set({
				label: parsed.label,
				external_account_uid: parsed.account_uid,
				credentials,
				currency: match.currency ?? existing.currency ?? "GBP",
			})
			.where(eq(bank_account.id, existing.id));
		revalidate();
		return { ok: true, id: existing.id };
	}

	const [inserted] = await db
		.insert(bank_account)
		.values({
			venue_id: venue.id,
			provider: "starling",
			label: parsed.label,
			external_account_uid: parsed.account_uid,
			credentials,
			currency: match.currency ?? "GBP",
			sort_order: Date.now() % 1000,
		})
		.returning();
	revalidate();
	return { ok: true, id: inserted.id };
}

const StarlingProbeSchema = z.object({
	access_token: z.string().min(1).optional().nullable(),
	account_uid: z.string().min(1),
	id: z.string().uuid().optional().nullable(),
});

export async function probeStarlingAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = StarlingProbeSchema.parse(input);
	let token = parsed.access_token?.trim();
	if (!token && parsed.id) {
		const existing = await loadAccount(parsed.id, venue.id);
		token = existing.credentials?.access_token;
	}
	return starlingProvider.probe({
		credentials: { access_token: token, account_uid: parsed.account_uid },
	});
}

const ListStarlingAccountsSchema = z.object({
	access_token: z.string().min(1),
});

export async function listStarlingAccountsAction(input) {
	await gate();
	const parsed = ListStarlingAccountsSchema.parse(input);
	return listStarlingAccountsForToken(parsed.access_token.trim());
}

// ── Revolut ────────────────────────────────────────────────────────────

const RevolutSaveCredsSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	label: z.string().min(1).max(120),
	environment: z.enum(["sandbox", "production"]),
	client_id: z.string().min(1),
	issuer: z.string().min(1),
	redirect_uri: z.string().url(),
	private_key_pem: z.string().min(1).optional().nullable(),
});

/**
 * Step 1 of Revolut setup. Saves the long-lived credentials (client id,
 * private key, environment). Tokens are added in a second step once the
 * admin has authorised the app and pasted the authorisation code.
 */
export async function saveRevolutCredentialsAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = RevolutSaveCredsSchema.parse(input);

	let existing = null;
	if (parsed.id) existing = await loadAccount(parsed.id, venue.id);
	const existingCreds = existing?.credentials ?? {};

	const private_key_pem =
		parsed.private_key_pem?.trim() || existingCreds.private_key_pem;
	if (!private_key_pem) {
		throw new Error("Paste a private key the first time you save.");
	}

	const credentials = {
		environment: parsed.environment,
		client_id: parsed.client_id,
		issuer: parsed.issuer,
		redirect_uri: parsed.redirect_uri,
		private_key_pem,
		access_token: existingCreds.access_token ?? null,
		refresh_token: existingCreds.refresh_token ?? null,
		access_token_expires_at: existingCreds.access_token_expires_at ?? null,
		scopes: existingCreds.scopes ?? null,
	};

	if (existing) {
		await db
			.update(bank_account)
			.set({ label: parsed.label, credentials })
			.where(eq(bank_account.id, existing.id));
		revalidate();
		return { ok: true, id: existing.id };
	}

	const [inserted] = await db
		.insert(bank_account)
		.values({
			venue_id: venue.id,
			provider: "revolut",
			label: parsed.label,
			credentials,
			currency: "GBP",
			sort_order: Date.now() % 1000,
		})
		.returning();
	revalidate();
	return { ok: true, id: inserted.id };
}

const RevolutAuthorizeSchema = z.object({
	id: z.string().uuid(),
	code: z.string().min(1),
});

/**
 * Step 2 of Revolut setup. Trades the auth code Revolut showed the user
 * for access + refresh tokens, persists, and (best-effort) lists the
 * available Revolut accounts so the admin can pick one in the next step.
 */
export async function authoriseRevolutAccountAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = RevolutAuthorizeSchema.parse(input);
	const account = await loadAccount(parsed.id, venue.id);

	const res = await exchangeAuthCode(account.credentials, parsed.code.trim());
	if (!res.ok) {
		throw new Error(res.error || "Token exchange failed.");
	}
	await db
		.update(bank_account)
		.set({ credentials: res.credentials })
		.where(eq(bank_account.id, account.id));

	// Fetch accounts for the picker UI
	const refreshed = { ...account, credentials: res.credentials };
	const accountsRes = await listRevolutAccounts(refreshed);
	revalidate();
	return {
		ok: true,
		accounts: accountsRes.ok ? accountsRes.accounts : [],
	};
}

const RevolutPickAccountSchema = z.object({
	id: z.string().uuid(),
	external_account_uid: z.string().min(1),
});

export async function pickRevolutAccountAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = RevolutPickAccountSchema.parse(input);
	const account = await loadAccount(parsed.id, venue.id);
	const accountsRes = await listRevolutAccounts(account);
	if (!accountsRes.ok) throw new Error(accountsRes.error || "Couldn't list accounts.");
	const match = accountsRes.accounts.find((a) => a.id === parsed.external_account_uid);
	if (!match) throw new Error("Account not found.");
	await db
		.update(bank_account)
		.set({
			external_account_uid: match.id,
			currency: match.currency ?? "GBP",
		})
		.where(eq(bank_account.id, account.id));
	revalidate();
	return { ok: true };
}

export async function probeRevolutAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const account = await loadAccount(input.id, venue.id);
	if (revolutProvider.refreshCredentials) {
		const refreshed = await revolutProvider.refreshCredentials(account);
		if (refreshed && refreshed !== account) {
			await db
				.update(bank_account)
				.set({ credentials: refreshed.credentials })
				.where(eq(bank_account.id, account.id));
			return revolutProvider.probe(refreshed);
		}
	}
	return revolutProvider.probe(account);
}

// ── Generic ────────────────────────────────────────────────────────────

const DeleteSchema = z.object({ id: z.string().uuid() });

export async function deleteBankAccountAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = DeleteSchema.parse(input);
	const account = await loadAccount(parsed.id, venue.id);
	await db
		.update(bank_account)
		.set({ deletedAt: new Date(), is_active: false })
		.where(eq(bank_account.id, account.id));
	revalidate();
	return { ok: true };
}

const ToggleSchema = z.object({ id: z.string().uuid(), is_active: z.boolean() });

export async function setBankAccountActiveAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = ToggleSchema.parse(input);
	const account = await loadAccount(parsed.id, venue.id);
	await db
		.update(bank_account)
		.set({ is_active: parsed.is_active })
		.where(eq(bank_account.id, account.id));
	revalidate();
	return { ok: true };
}

const SyncSchema = z.object({ id: z.string().uuid(), force: z.boolean().optional() });

export async function syncBankAccountNowAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = SyncSchema.parse(input);
	const account = await loadAccount(parsed.id, venue.id);
	const result = await syncBankAccount(account, { force: parsed.force ?? false });
	revalidate();
	return result;
}
