/**
 * Minimal Starling Bank read of the account balance for the finance
 * dashboard. We don't pull transactions — Starling categorisation isn't
 * trusted enough yet to be useful. Just a "cash on hand" sanity check.
 *
 * Env vars:
 *   STARLING_ACCESS_TOKEN   — Personal Access Token (scope: balance:read)
 *   STARLING_ACCOUNT_UID    — Account UID from the Starling dashboard
 *
 * Result is cached server-side for 5 minutes (Next's `revalidate`).
 */

const BASE_URL = "https://api.starlingbank.com";

export function starlingConfig() {
	const token = process.env.STARLING_ACCESS_TOKEN;
	const accountUid = process.env.STARLING_ACCOUNT_UID;
	return {
		token: token || null,
		accountUid: accountUid || null,
		configured: !!(token && accountUid),
	};
}

export async function getStarlingBalance() {
	const cfg = starlingConfig();
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
