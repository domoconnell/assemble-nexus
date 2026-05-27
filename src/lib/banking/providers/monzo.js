/**
 * Monzo (Personal + Business) provider plugin.
 *
 * Auth model: OAuth 2.0 with `client_id` + `client_secret` (Monzo's
 * "confidential" client). The admin registers an OAuth client at
 * https://developers.monzo.com/apps, with our redirect URI. Flow:
 *
 *   1. Admin saves client_id + client_secret + redirect_uri (this file
 *      stores them in `credentials`).
 *   2. We render the authorise URL `https://auth.monzo.com/?client_id=
 *      …&redirect_uri=…&response_type=code&state=<random>`. The admin
 *      visits it, gets a push notification on their phone, approves it,
 *      and Monzo redirects to `redirect_uri` with `?code=…&state=…`.
 *   3. Admin pastes the `code` into our settings UI. We POST to
 *      /oauth2/token, exchange for access + refresh tokens, persist.
 *   4. Strong Customer Authentication: Monzo also shows a separate
 *      approval card in the app immediately after exchange. The admin
 *      needs to tap "Approve" there too - until they do, /transactions
 *      returns `auth_failed`. We surface that as a clear error.
 *
 * Tokens last ~6 hours; refresh tokens last ~90 days but Monzo rotates
 * them on every refresh. Confidential clients must include the
 * client_secret on every token call.
 *
 * Credentials shape:
 *   {
 *     client_id:            string,
 *     client_secret:        string,
 *     redirect_uri:         string,
 *     access_token:         string | null,
 *     refresh_token:        string | null,
 *     access_token_expires_at: ISO string | null,
 *   }
 */

import crypto from "node:crypto";

const AUTH_BASE = "https://auth.monzo.com/";
const API_BASE = "https://api.monzo.com";

function tokenExpiringSoon(credentials, marginSec = 120) {
	if (!credentials.access_token) return true;
	if (!credentials.access_token_expires_at) return true;
	const expMs = new Date(credentials.access_token_expires_at).getTime();
	if (Number.isNaN(expMs)) return true;
	return expMs - Date.now() < marginSec * 1000;
}

export function buildMonzoAuthoriseUrl(credentials, { state } = {}) {
	const stateValue = state || crypto.randomBytes(16).toString("hex");
	const params = new URLSearchParams({
		client_id: credentials.client_id,
		redirect_uri: credentials.redirect_uri,
		response_type: "code",
		state: stateValue,
	});
	return { url: `${AUTH_BASE}?${params}`, state: stateValue };
}

async function postForm(path, body) {
	const res = await fetch(`${API_BASE}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
		},
		body,
		cache: "no-store",
	});
	const text = await res.text();
	let json = null;
	if (text) {
		try { json = JSON.parse(text); } catch { /* */ }
	}
	if (!res.ok) {
		return {
			ok: false,
			status: res.status,
			error: json?.message || json?.error_description || json?.error || `Monzo ${res.status}: ${text.slice(0, 200)}`,
		};
	}
	return { ok: true, body: json };
}

export async function exchangeAuthCode(credentials, code) {
	const body = new URLSearchParams({
		grant_type: "authorization_code",
		client_id: credentials.client_id,
		client_secret: credentials.client_secret,
		redirect_uri: credentials.redirect_uri,
		code,
	});
	const res = await postForm("/oauth2/token", body);
	if (!res.ok) return res;
	const tokens = res.body;
	const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 21600) * 1000);
	return {
		ok: true,
		credentials: {
			...credentials,
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token ?? credentials.refresh_token ?? null,
			access_token_expires_at: expiresAt.toISOString(),
		},
	};
}

async function refreshAccessToken(credentials) {
	if (!credentials.refresh_token) {
		return { ok: false, error: "No refresh token - re-authorise the account." };
	}
	const body = new URLSearchParams({
		grant_type: "refresh_token",
		client_id: credentials.client_id,
		client_secret: credentials.client_secret,
		refresh_token: credentials.refresh_token,
	});
	const res = await postForm("/oauth2/token", body);
	if (!res.ok) return res;
	const tokens = res.body;
	const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 21600) * 1000);
	return {
		ok: true,
		credentials: {
			...credentials,
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token ?? credentials.refresh_token,
			access_token_expires_at: expiresAt.toISOString(),
		},
	};
}

async function authedFetch(account, path) {
	const res = await fetch(`${API_BASE}${path}`, {
		headers: {
			Authorization: `Bearer ${account.credentials.access_token}`,
			Accept: "application/json",
		},
		cache: "no-store",
	});
	const text = await res.text();
	let json = null;
	if (text) {
		try { json = JSON.parse(text); } catch { /* */ }
	}
	if (!res.ok) {
		const code = json?.code || "";
		const friendly =
			code === "forbidden.insufficient_permissions" ||
			code === "unauthorized.bad_access_token.evicted"
				? "Monzo token rejected - re-authorise the account."
				: code === "forbidden.verification_required"
					? "Monzo needs Strong Customer Authentication. Open the Monzo app, find the pending approval, and tap Approve."
					: json?.message || json?.error || `Monzo ${res.status}: ${text.slice(0, 200)}`;
		return { ok: false, status: res.status, error: friendly };
	}
	return { ok: true, body: json };
}

/**
 * Used by the setup UI: returns `{ accounts: [...] }` so the admin can
 * pick which Monzo account (current account vs joint vs business) to
 * sync.
 */
export async function listMonzoAccounts(account) {
	const res = await authedFetch(account, "/accounts");
	if (!res.ok) return res;
	const accounts = (res.body?.accounts ?? []).filter((a) => !a.closed);
	return { ok: true, accounts };
}

export const monzoProvider = {
	key: "monzo",
	label: "Monzo",
	helpUrl: "https://developers.monzo.com/docs/getting-started",

	async refreshCredentials(account) {
		const creds = account.credentials ?? {};
		if (!creds.client_id || !creds.client_secret) return account;
		if (!tokenExpiringSoon(creds)) return account;
		const res = await refreshAccessToken(creds);
		if (!res.ok) {
			console.error("[monzo.refreshCredentials]", res.error);
			return account;
		}
		return { ...account, credentials: res.credentials };
	},

	async probe(account) {
		const creds = account.credentials ?? {};
		if (!creds.client_id || !creds.client_secret) {
			return { ok: false, error: "Save Client ID + Client Secret first." };
		}
		if (!creds.access_token) {
			return { ok: false, error: "Not yet authorised - paste an authorisation code." };
		}
		const ping = await authedFetch(account, "/ping/whoami");
		if (!ping.ok) {
			return { ok: false, status: ping.status, error: ping.error };
		}
		if (ping.body && ping.body.authenticated === false) {
			return { ok: false, error: "Monzo says the token isn't authenticated. Re-authorise." };
		}
		// /accounts to surface which one we'll sync if the user hasn't
		// picked yet.
		const list = await authedFetch(account, "/accounts");
		const accounts = list.ok ? (list.body?.accounts ?? []).filter((a) => !a.closed) : [];
		const match = account.external_account_uid
			? accounts.find((a) => a.id === account.external_account_uid)
			: accounts[0];
		return {
			ok: true,
			currency: match?.currency ?? account.currency ?? "GBP",
			account_label: match?.description || match?.account_number || null,
			account_count: accounts.length,
		};
	},

	async fetchBalance(account) {
		const creds = account.credentials ?? {};
		if (!creds.access_token || !account.external_account_uid) {
			return { ok: false, error: "Missing access token or account UID." };
		}
		const path = `/balance?account_id=${encodeURIComponent(account.external_account_uid)}`;
		const res = await authedFetch(account, path);
		if (!res.ok) return res;
		const b = res.body ?? {};
		return {
			ok: true,
			cleared_minor: Number(b.balance ?? 0),
			effective_minor: Number(b.balance ?? 0),
			pending_minor: 0,
			currency: b.currency ?? account.currency ?? "GBP",
		};
	},

	async listTransactions(account, { from, to }) {
		const creds = account.credentials ?? {};
		if (!creds.access_token || !account.external_account_uid) {
			return { ok: false, error: "Missing access token or account UID." };
		}

		// Monzo paginates with `since` (cursor or timestamp) + `before` +
		// `limit`. We walk forward from `from` until we run out of pages.
		const items = [];
		let cursorSince = from.toISOString();
		let safety = 0;
		while (safety++ < 50) {
			const params = new URLSearchParams({
				account_id: account.external_account_uid,
				since: cursorSince,
				before: to.toISOString(),
				limit: "100",
				"expand[]": "merchant",
			});
			const res = await authedFetch(account, `/transactions?${params}`);
			if (!res.ok) return res;
			const batch = res.body?.transactions ?? [];
			if (batch.length === 0) break;

			for (const tx of batch) {
				// Monzo includes pending tx + reservations; we only persist
				// settled or active ones. Declined/pending tx come back with
				// settled === "" - skip them.
				if (tx.decline_reason) continue;

				const amount = Number(tx.amount ?? 0);
				if (!Number.isFinite(amount) || amount === 0) continue;

				items.push({
					external_id: tx.id,
					direction: amount > 0 ? "IN" : "OUT",
					amount_minor: Math.abs(amount),
					currency: tx.currency ?? account.currency ?? "GBP",
					counterparty_name:
						tx.merchant?.name ??
						tx.counterparty?.name ??
						tx.description ??
						null,
					counterparty_account:
						tx.counterparty?.account_number ??
						tx.counterparty?.user_id ??
						null,
					reference: tx.notes || tx.description || null,
					category_uid: tx.category ?? null,
					settled_at: tx.settled ? new Date(tx.settled) : null,
					transaction_time: tx.created ? new Date(tx.created) : null,
					raw_payload: tx,
				});
			}

			if (batch.length < 100) break;
			// Use the last seen transaction's id as the cursor for the
			// next page (Monzo accepts either a timestamp or a tx id as
			// `since`). Using the id is exact pagination, no risk of
			// re-fetching the same item.
			const lastId = batch[batch.length - 1]?.id;
			if (!lastId) break;
			cursorSince = lastId;
		}

		return { ok: true, items };
	},
};
