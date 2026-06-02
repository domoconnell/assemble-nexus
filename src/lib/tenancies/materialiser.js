import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { tenancy_session } from "@/db/schema/entities/tenancy.js";
import {
	listActiveTenancies,
	listLinesForTenancy,
	insertSessions,
} from "@/db/queries/tenancies.js";
import { generateSessionDates } from "./schedule.js";

// Re-export for legacy import paths.
export { generateSessionDates };

/**
 * Top up `tenancy_session` rows through `until` for every active tenancy
 * at the given venue. Iterates each scheduled tenancy_line - occupancy
 * lines produce no sessions. Idempotent: existing rows in the future
 * window are skipped on (line, starts_at).
 */
export async function materialiseSessionsThrough(venueId, until) {
	const now = new Date();
	const tenancies = await listActiveTenancies(venueId);
	const results = [];
	for (const t of tenancies) {
		const lines = await listLinesForTenancy(t.id);
		const scheduledLines = lines.filter((l) => l.kind === "scheduled");
		let inserted = 0;
		const errors = [];
		for (const line of scheduledLines) {
			try {
				const existing = await db
					.select({
						starts_at: tenancy_session.starts_at,
					})
					.from(tenancy_session)
					.where(
						and(
							eq(tenancy_session.tenancy_line_id, line.id),
							isNull(tenancy_session.deletedAt),
							gte(tenancy_session.starts_at, now),
						),
					);
				const known = new Set(
					existing.map((r) => new Date(r.starts_at).toISOString()),
				);
				const want = generateSessionDates(
					line,
					{ starts_on: t.starts_on, ends_on: t.ends_on },
					{ from: now, until },
				);
				const fresh = want.filter(
					(s) => !known.has(s.starts_at.toISOString()),
				);
				if (fresh.length > 0) {
					await insertSessions(
						fresh.map((s) => ({
							tenancy_id: t.id,
							tenancy_line_id: line.id,
							rule_id: s.rule_id,
							starts_at: s.starts_at,
							ends_at: s.ends_at,
							status: "scheduled",
							// Snapshot the per-session rate when that's the billing
							// mode for this line. Other modes compute amounts at
							// invoice time, not at session creation.
							rate_cents_snapshot: s.rate_cents ?? null,
						})),
					);
					inserted += fresh.length;
				}
			} catch (err) {
				errors.push({ line_id: line.id, error: err?.message || String(err) });
			}
		}
		results.push({ tenancy_id: t.id, inserted, errors });
	}
	return results;
}
