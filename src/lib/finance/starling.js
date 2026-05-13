/**
 * Minimal Starling Bank read of the account balance for the finance
 * dashboard. We don't pull transactions — Starling categorisation isn't
 * trusted enough yet to be useful. Just a "cash on hand" sanity check.
 *
 * Credentials live in the per-venue `starling` setting (Personal Access
 * Token + Account UID). Legacy env-var values are honoured as a fallback so
 * existing deploys keep working until the new settings page is filled in.
 */

const BASE_URL = "https://api.starlingbank.com";

/**
 * Coerce a DB-backed setting (or null) into the `{ token, accountUid }`
 * shape the API client needs, falling back to env vars.
 */
export function resolveStarlingCreds(settings) {
	const token = settings?.access_token || process.env.STARLING_ACCESS_TOKEN || null;
	const accountUid = settings?.account_uid || process.env.STARLING_ACCOUNT_UID || null;
	return { token, accountUid, configured: !!(token && accountUid) };
}

export async function getStarlingBalance(settings) {
	const cfg = resolveStarlingCreds(settings);
	if (!cfg.configured) return { configured: false };
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 4000);
	try {
		const res = await fetch(
			`${BASE_URL}/api/v2/accounts/${cfg.accountUid}/balance`,
			{
				headers: {
					Authorization: `Bearer ${cfg.token}`,
					Accept: "application/json",
				},
				signal: controller.signal,
				next: { revalidate: 300 },
			},
		);
		if (!res.ok) {
			return { configured: true, error: `Starling ${res.status}` };
		}
		const data = await res.json();
		return {
			configured: true,
			cleared_cents: data.clearedBalance?.minorUnits ?? 0,
			effective_cents: data.effectiveBalance?.minorUnits ?? 0,
			pending_cents: data.pendingTransactions?.minorUnits ?? 0,
			currency: data.clearedBalance?.currency ?? "GBP",
			fetched_at: new Date().toISOString(),
		};
	} catch (err) {
		if (err?.name === "AbortError") {
			return { configured: true, error: "Starling timed out" };
		}
		return { configured: true, error: err?.message || "Starling fetch failed" };
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Look up account metadata for a token — used by the settings page's save
 * flow so we can stash the `defaultCategory` UID needed for the
 * transactions endpoint.
 */
export async function listStarlingAccounts(token) {
	if (!token) return { ok: false, error: "Missing token" };
	const res = await fetch(`${BASE_URL}/api/v2/accounts`, {
		headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
		cache: "no-store",
	});
	if (!res.ok) {
		return { ok: false, status: res.status, error: `Starling ${res.status}` };
	}
	const data = await res.json();
	return { ok: true, accounts: data.accounts ?? [] };
}

/**
 * Pull settled transactions in a date range. Starling caps the window so we
 * paginate by month-sized chunks; the caller decides the overall span.
 */
export async function listStarlingTransactions({ token, accountUid, categoryUid, from, to }) {
	if (!token || !accountUid || !categoryUid) {
		return { ok: false, error: "Missing token, accountUid, or categoryUid" };
	}
	const params = new URLSearchParams({
		minTransactionTimestamp: from.toISOString(),
		maxTransactionTimestamp: to.toISOString(),
	});
	const url = `${BASE_URL}/api/v2/feed/account/${accountUid}/category/${categoryUid}/transactions-between?${params}`;
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
		cache: "no-store",
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		return { ok: false, status: res.status, error: `Starling ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}` };
	}
	const data = await res.json();
	return { ok: true, feedItems: data.feedItems ?? [] };
}

/**
 * Plain balance fetch (no Next fetch cache). Used by the sync service.
 */
export async function fetchStarlingBalance({ token, accountUid }) {
	if (!token || !accountUid) return { ok: false, error: "Missing token or accountUid" };
	const res = await fetch(`${BASE_URL}/api/v2/accounts/${accountUid}/balance`, {
		headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
		cache: "no-store",
	});
	if (!res.ok) return { ok: false, status: res.status, error: `Starling ${res.status}` };
	const data = await res.json();
	return {
		ok: true,
		cleared_minor: data.clearedBalance?.minorUnits ?? 0,
		effective_minor: data.effectiveBalance?.minorUnits ?? 0,
		pending_minor: data.pendingTransactions?.minorUnits ?? 0,
		currency: data.clearedBalance?.currency ?? "GBP",
	};
}

/**
 * One-shot probe used by the settings page's "Test connection" button.
 * Returns either `{ ok: true, currency, cleared_cents }` or `{ ok: false, error }`.
 * No caching — bypasses Next's fetch cache so a freshly-pasted token is hit live.
 */
export async function probeStarling({ token, accountUid }) {
	if (!token || !accountUid) {
		return { ok: false, error: "Missing token or account UID." };
	}
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 4000);
	try {
		const res = await fetch(
			`${BASE_URL}/api/v2/accounts/${accountUid}/balance`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/json",
				},
				signal: controller.signal,
				cache: "no-store",
			},
		);
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			return {
				ok: false,
				status: res.status,
				error:
					res.status === 401 || res.status === 403
						? "Starling rejected the token (check scopes and that it matches the account)."
						: res.status === 404
							? "Account UID not found for this token."
							: `Starling returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
			};
		}
		const data = await res.json();
		return {
			ok: true,
			currency: data.clearedBalance?.currency ?? "GBP",
			cleared_cents: data.clearedBalance?.minorUnits ?? 0,
		};
	} catch (err) {
		if (err?.name === "AbortError") return { ok: false, error: "Starling timed out." };
		return { ok: false, error: err?.message || "Starling probe failed" };
	} finally {
		clearTimeout(timeout);
	}
}
