/**
 * Starling Bank provider plugin.
 *
 * Auth model: a single Personal Access Token (PAT) generated in the
 * Starling Developer Portal. PATs are long-lived; we don't need OAuth
 * refresh. Each `bank_account` row stores one PAT and one account UID.
 *
 * Credentials shape:
 *   {
 *     access_token: string,         // PAT, scope balance:read transaction:read
 *     account_uid:  string,         // Starling accountUid (uuid)
 *     default_category: string,     // category UID required for the txns endpoint
 *   }
 *
 * Transactions endpoint is keyed by category, not account, so we look the
 * default category up once at setup time and stash it in credentials.
 */

const BASE_URL = "https://api.starlingbank.com";

async function call(token, path) {
	const res = await fetch(`${BASE_URL}${path}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/json",
		},
		cache: "no-store",
	});
	const text = await res.text();
	let json = null;
	if (text) {
		try { json = JSON.parse(text); } catch { /* non-json */ }
	}
	return { ok: res.ok, status: res.status, body: json, raw: text };
}

/**
 * Look up the accounts on a Starling PAT - used by the setup form so the
 * user can pick the right account UID from a dropdown rather than copy/paste
 * the UUID by hand. Returns the raw account list shape from Starling.
 */
export async function listStarlingAccountsForToken(token) {
	const res = await call(token, "/api/v2/accounts");
	if (!res.ok) return { ok: false, status: res.status, error: `Starling ${res.status}` };
	return { ok: true, accounts: res.body?.accounts ?? [] };
}

export const starlingProvider = {
	key: "starling",
	label: "Starling Bank",
	helpUrl: "https://developer.starlingbank.com/personal/list",

	async probe(account) {
		const creds = account.credentials ?? {};
		if (!creds.access_token || !creds.account_uid) {
			return { ok: false, error: "Missing access token or account UID." };
		}
		const res = await call(creds.access_token, `/api/v2/accounts/${creds.account_uid}/balance`);
		if (!res.ok) {
			return {
				ok: false,
				status: res.status,
				error:
					res.status === 401 || res.status === 403
						? "Starling rejected the token (check scopes and that it matches the account)."
						: res.status === 404
							? "Account UID not found for this token."
							: `Starling returned ${res.status}`,
			};
		}
		return {
			ok: true,
			currency: res.body?.clearedBalance?.currency ?? "GBP",
			cleared_minor: res.body?.clearedBalance?.minorUnits ?? 0,
		};
	},

	async fetchBalance(account) {
		const creds = account.credentials ?? {};
		if (!creds.access_token || !creds.account_uid) {
			return { ok: false, error: "Missing token or accountUid" };
		}
		const res = await call(creds.access_token, `/api/v2/accounts/${creds.account_uid}/balance`);
		if (!res.ok) return { ok: false, status: res.status, error: `Starling ${res.status}` };
		return {
			ok: true,
			cleared_minor: res.body?.clearedBalance?.minorUnits ?? 0,
			effective_minor: res.body?.effectiveBalance?.minorUnits ?? 0,
			pending_minor: res.body?.pendingTransactions?.minorUnits ?? 0,
			currency: res.body?.clearedBalance?.currency ?? "GBP",
		};
	},

	async listTransactions(account, { from, to }) {
		const creds = account.credentials ?? {};
		if (!creds.access_token || !creds.account_uid || !creds.default_category) {
			return { ok: false, error: "Missing token, accountUid, or default_category" };
		}
		const params = new URLSearchParams({
			minTransactionTimestamp: from.toISOString(),
			maxTransactionTimestamp: to.toISOString(),
		});
		const path = `/api/v2/feed/account/${creds.account_uid}/category/${creds.default_category}/transactions-between?${params}`;
		const res = await call(creds.access_token, path);
		if (!res.ok) {
			return { ok: false, status: res.status, error: `Starling ${res.status}` };
		}
		const items = (res.body?.feedItems ?? []).map((item) => ({
			external_id: item.feedItemUid,
			direction: item.direction === "IN" ? "IN" : "OUT",
			amount_minor: item.amount?.minorUnits ?? 0,
			currency: item.amount?.currency ?? "GBP",
			counterparty_name: item.counterPartyName ?? null,
			counterparty_account:
				item.counterPartySubEntityIdentifier ??
				item.counterPartyIdentifier ??
				null,
			reference: item.reference ?? null,
			category_uid: item.categoryUid ?? creds.default_category,
			settled_at: item.settlementTime ? new Date(item.settlementTime) : null,
			transaction_time: item.transactionTime ? new Date(item.transactionTime) : null,
			raw_payload: item,
		}));
		return { ok: true, items };
	},
};
