import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
	tenancy_session,
} from "@/db/schema/entities/tenancy.js";
import {
	listActiveScheduledTenancies,
	insertSessions,
} from "@/db/queries/tenancies.js";
import { generateSessionDates } from "./schedule.js";

// Re-export so existing imports of `generateSessionDates` from
// materialiser.js keep working.
export { generateSessionDates };

/**
 * Make sure every scheduled_recurring tenancy has session rows
 * materialised through `until`. Idempotent: skips dates already present.
 *
 * Returns a summary of how many sessions were inserted per tenancy.
 */
export async function materialiseSessionsThrough(venueId, until) {
	const now = new Date();
	const tenancies = await listActiveScheduledTenancies(venueId);
	const results = [];
	for (const t of tenancies) {
		try {
			const existing = await db
				.select({ starts_at: tenancy_session.starts_at })
				.from(tenancy_session)
				.where(
					and(
						eq(tenancy_session.tenancy_id, t.id),
						isNull(tenancy_session.deletedAt),
						gte(tenancy_session.starts_at, now),
					),
				);
			const known = new Set(existing.map((r) => new Date(r.starts_at).toISOString()));
			const want = generateSessionDates(t, { from: now, until });
			const fresh = want.filter((s) => !known.has(s.starts_at.toISOString()));
			if (fresh.length > 0) {
				await insertSessions(
					fresh.map((s) => ({
						tenancy_id: t.id,
						rule_id: s.rule_id,
						starts_at: s.starts_at,
						ends_at: s.ends_at,
						status: "scheduled",
						// Rate snapshotted from the rule that produced this
						// occurrence; lets future rate changes apply to new
						// sessions without re-pricing already-materialised ones.
						rate_cents_snapshot: s.rate_cents ?? null,
					})),
				);
			}
			results.push({ tenancy_id: t.id, inserted: fresh.length });
		} catch (err) {
			results.push({
				tenancy_id: t.id,
				error: err?.message || String(err),
			});
		}
	}
	return results;
}
