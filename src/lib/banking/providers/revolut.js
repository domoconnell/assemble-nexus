import crypto from "node:crypto";

/**
 * Revolut Business provider plugin.
 *
 * Auth model: certificate-based OAuth 2.0 with JWT client_assertion. The
 * admin:
 *
 *   1. Generates an RSA key pair (private.pem + public.pem) with openssl.
 *   2. Uploads the PUBLIC cert in Revolut Business → Settings → APIs → Add.
 *   3. Revolut returns a `client_id` once the cert is accepted.
 *   4. Visits the authorise URL we render - Revolut redirects back to the
 *      `redirect_uri` with an `?code=<authorisation_code>` parameter.
 *   5. Pastes the code into our settings UI. We POST to /auth/token signing
 *      a short-lived JWT with the private key, exchanging the code for an
 *      access_token (40 min) + refresh_token (~90 days, rotating).
 *
 * Subsequent calls auto-refresh the access token before it expires. The
 * private key NEVER leaves the server - it's stored in the bank_account
 * `credentials` JSONB.
 *
 * Credentials shape:
 *   {
 *     environment:           "sandbox" | "production",
 *     client_id:             string,
 *     private_key_pem:       string,   // -----BEGIN PRIVATE KEY----- …
 *     issuer:                string,   // JWT `iss` claim - your app domain
 *     redirect_uri:          string,
 *     access_token:          string | null,
 *     refresh_token:         string | null,
 *     access_token_expires_at: ISO string | null,
 *     scopes:                string | null,
 *   }
 */

const ENV_BASE = {
	production: {
		api: "https://b2b.revolut.com/api/1.0",
		authorise: "https://business.revolut.com/app-confirm",
	},
	sandbox: {
		api: "https://sandbox-b2b.revolut.com/api/1.0",
		authorise: "https://sandbox-business.revolut.com/app-confirm",
	},
};

const CLIENT_ASSERTION_TYPE =
	"urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

function base64url(input) {
	return Buffer.from(input)
		.toString("base64")
		.replace(/=+$/, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function signJwt({ issuer, clientId, privateKeyPem }) {
	const now = Math.floor(Date.now() / 1000);
	const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const payload = base64url(
		JSON.stringify({
			iss: issuer,
			sub: clientId,
			aud: "https://revolut.com",
			iat: now,
			exp: now + 60 * 30, // 30 min - well inside the 24h cap
		}),
	);
	const signer = crypto.createSign("RSA-SHA256");
	signer.update(`${header}.${payload}`);
	signer.end();
	const sig = base64url(signer.sign(privateKeyPem));
	return `${header}.${payload}.${sig}`;
}

function envBase(env) {
	return ENV_BASE[env] ?? ENV_BASE.sandbox;
}

/**
 * The URL the admin visits in their browser to grant our app access.
 */
export function buildRevolutAuthoriseUrl(credentials) {
	const base = envBase(credentials.environment).authorise;
	const params = new URLSearchParams({
		client_id: credentials.client_id,
		redirect_uri: credentials.redirect_uri,
		response_type: "code",
		scope: "READ",
	});
	return `${base}?${params}`;
}

async function postToken(credentials, body) {
	const base = envBase(credentials.environment).api;
	const assertion = signJwt({
		issuer: credentials.issuer,
		clientId: credentials.client_id,
		privateKeyPem: credentials.private_key_pem,
	});
	body.append("client_id", credentials.client_id);
	body.append("client_assertion_type", CLIENT_ASSERTION_TYPE);
	body.append("client_assertion", assertion);

	const res = await fetch(`${base}/auth/token`, {
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
			error: json?.error_description || json?.error || `Revolut ${res.status}: ${text.slice(0, 200)}`,
		};
	}
	return { ok: true, body: json };
}

/**
 * Trade the one-time `authorisation_code` from the Revolut redirect for
 * access + refresh tokens. Mutates and returns the credentials object with
 * the tokens populated. Caller persists.
 */
export async function exchangeAuthCode(credentials, code) {
	const body = new URLSearchParams({ grant_type: "authorization_code", code });
	const res = await postToken(credentials, body);
	if (!res.ok) return res;
	const tokens = res.body;
	const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 2400) * 1000);
	return {
		ok: true,
		credentials: {
			...credentials,
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token ?? credentials.refresh_token ?? null,
			access_token_expires_at: expiresAt.toISOString(),
			scopes: tokens.scopes ?? null,
		},
	};
}

async function refreshAccessToken(credentials) {
	if (!credentials.refresh_token) {
		return { ok: false, error: "No refresh token - re-authorise the account." };
	}
	const body = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: credentials.refresh_token,
	});
	const res = await postToken(credentials, body);
	if (!res.ok) return res;
	const tokens = res.body;
	const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 2400) * 1000);
	return {
		ok: true,
		credentials: {
			...credentials,
			access_token: tokens.access_token,
			// Revolut rotates refresh tokens - always honour the new one if present.
			refresh_token: tokens.refresh_token ?? credentials.refresh_token,
			access_token_expires_at: expiresAt.toISOString(),
			scopes: tokens.scopes ?? credentials.scopes,
		},
	};
}

function tokenExpiringSoon(credentials, marginSec = 120) {
	if (!credentials.access_token) return true;
	if (!credentials.access_token_expires_at) return true;
	const expMs = new Date(credentials.access_token_expires_at).getTime();
	if (Number.isNaN(expMs)) return true;
	return expMs - Date.now() < marginSec * 1000;
}

async function authedFetch(account, path) {
	const base = envBase(account.credentials.environment).api;
	const res = await fetch(`${base}${path}`, {
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
		return {
			ok: false,
			status: res.status,
			error: json?.message || json?.error || `Revolut ${res.status}: ${text.slice(0, 200)}`,
		};
	}
	return { ok: true, body: json };
}

export async function listRevolutAccounts(account) {
	const res = await authedFetch(account, "/accounts");
	if (!res.ok) return res;
	return { ok: true, accounts: Array.isArray(res.body) ? res.body : [] };
}

function legBelongsToAccount(leg, externalAccountUid) {
	if (!externalAccountUid) return true;
	return leg.account_id === externalAccountUid;
}

export const revolutProvider = {
	key: "revolut",
	label: "Revolut Business",
	helpUrl: "https://developer.revolut.com/docs/business/business-api",

	/**
	 * Refresh the access token if it's missing or within a 2-minute window
	 * of expiry. Returns the updated account (caller persists credentials).
	 */
	async refreshCredentials(account) {
		const creds = account.credentials ?? {};
		if (!creds.client_id || !creds.private_key_pem) return account;
		if (!tokenExpiringSoon(creds)) return account;
		const res = await refreshAccessToken(creds);
		if (!res.ok) {
			// Don't throw - let the next API call fail with a clearer error
			console.error("[revolut.refreshCredentials]", res.error);
			return account;
		}
		return { ...account, credentials: res.credentials };
	},

	async probe(account) {
		const creds = account.credentials ?? {};
		if (!creds.client_id || !creds.private_key_pem) {
			return { ok: false, error: "Upload a private key and save Client ID first." };
		}
		if (!creds.access_token) {
			return { ok: false, error: "Not yet authorised - paste an authorisation code." };
		}
		const res = await authedFetch(account, "/accounts");
		if (!res.ok) {
			return {
				ok: false,
				status: res.status,
				error:
					res.status === 401
						? "Revolut rejected the token. Re-authorise the account."
						: res.error,
			};
		}
		const accounts = Array.isArray(res.body) ? res.body : [];
		const match = account.external_account_uid
			? accounts.find((a) => a.id === account.external_account_uid)
			: accounts[0];
		return {
			ok: true,
			currency: match?.currency ?? "GBP",
			account_label: match?.name ?? null,
			account_count: accounts.length,
		};
	},

	async fetchBalance(account) {
		const creds = account.credentials ?? {};
		if (!creds.access_token || !account.external_account_uid) {
			return { ok: false, error: "Missing access token or account UID." };
		}
		const res = await authedFetch(account, `/accounts/${encodeURIComponent(account.external_account_uid)}`);
		if (!res.ok) return res;
		const a = res.body ?? {};
		const cleared = Math.round(Number(a.balance ?? 0) * 100);
		return {
			ok: true,
			cleared_minor: cleared,
			effective_minor: cleared,
			pending_minor: 0,
			currency: a.currency ?? account.currency ?? "GBP",
		};
	},

	async listTransactions(account, { from, to }) {
		const creds = account.credentials ?? {};
		if (!creds.access_token || !account.external_account_uid) {
			return { ok: false, error: "Missing access token or account UID." };
		}

		// Paginate using `to` as the next page's upper bound - Revolut returns
		// transactions in descending completed_at order, so we walk backwards.
		const items = [];
		let upper = to;
		let safety = 0;
		while (safety++ < 50) {
			const params = new URLSearchParams({
				account: account.external_account_uid,
				from: from.toISOString(),
				to: upper.toISOString(),
				count: "1000",
			});
			const res = await authedFetch(account, `/transactions?${params}`);
			if (!res.ok) return res;
			const batch = Array.isArray(res.body) ? res.body : [];
			if (batch.length === 0) break;

			for (const tx of batch) {
				if (tx.state !== "completed") continue;
				const legs = Array.isArray(tx.legs) ? tx.legs : [];
				for (const leg of legs) {
					if (!legBelongsToAccount(leg, account.external_account_uid)) continue;
					const amount = Number(leg.amount ?? 0);
					if (!Number.isFinite(amount) || amount === 0) continue;
					items.push({
						external_id: `${tx.id}:${leg.leg_id ?? "0"}`,
						direction: amount > 0 ? "IN" : "OUT",
						amount_minor: Math.round(Math.abs(amount) * 100),
						currency: leg.currency ?? account.currency ?? "GBP",
						counterparty_name:
							leg.counterparty?.account_id ??
							tx.merchant?.name ??
							leg.description ??
							null,
						counterparty_account: leg.counterparty?.account_id ?? null,
						reference: tx.reference ?? leg.description ?? null,
						category_uid: tx.type ?? null,
						settled_at: tx.completed_at ? new Date(tx.completed_at) : null,
						transaction_time: tx.created_at ? new Date(tx.created_at) : null,
						raw_payload: { tx, leg },
					});
				}
			}

			if (batch.length < 1000) break;
			// Move the upper bound to the earliest completed_at minus 1ms.
			const oldest = batch[batch.length - 1];
			const oldestTime = oldest?.completed_at ?? oldest?.created_at;
			if (!oldestTime) break;
			const next = new Date(new Date(oldestTime).getTime() - 1);
			if (next <= from) break;
			upper = next;
		}

		return { ok: true, items };
	},
};
