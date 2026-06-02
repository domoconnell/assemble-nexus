import { and, eq, gte, isNull, ne } from "drizzle-orm";
import { db } from "@/db/index.js";
import { tenancy_session } from "@/db/schema/entities/tenancy.js";
import {
	listActiveTenancies,
	listLinesForTenancy,
	insertSessions,
	getTenancyById,
} from "@/db/queries/tenancies.js";
import { generateSessionDates } from "./schedule.js";

// Re-export for legacy import paths.
export { generateSessionDates };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// Materialise 12 months ahead so the admin can see a full year of
// sessions on the calendar without waiting for the cron to top up.
const DEFAULT_HORIZON_DAYS = 365;

function defaultHorizonUntil(today = new Date()) {
	return new Date(today.getTime() + DEFAULT_HORIZON_DAYS * ONE_DAY_MS);
}

/**
 * Midnight at the start of the current day in Europe/London, expressed
 * as a UTC Date. Used as the "future" cutoff so a session scheduled for
 * 09:00 today is still counted as future when the admin clicks Fill at
 * 11:00 — the day's session hasn't been billed yet, it just hasn't
 * finished happening.
 */
function startOfTodayLondon() {
	const ymd = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/London",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
	const [y, m, d] = ymd.split("-").map(Number);
	// Find the London offset at midnight on that date and back-correct
	// to UTC so the moment we return *is* 00:00 London time.
	const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
	const parts = new Intl.DateTimeFormat("en", {
		timeZone: "Europe/London",
		timeZoneName: "longOffset",
	}).formatToParts(new Date(guess));
	const off = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
	const match = off.match(/GMT([+-])(\d{2}):(\d{2})/);
	if (!match) return new Date(guess);
	const sign = match[1] === "+" ? 1 : -1;
	const offMs = sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10)) * 60 * 1000;
	return new Date(guess - offMs);
}

/**
 * Materialise (top up) future sessions for one tenancy. Iterates every
 * scheduled line and inserts any (line, starts_at) pairs that don't
 * already exist in the future window. Occupancy lines produce no
 * sessions. Sessions linked to invoices are left untouched even if the
 * line's schedule has changed.
 */
export async function materialiseSessionsForTenancy(tenancyId, { until } = {}) {
	const t = await getTenancyById(tenancyId);
	if (!t || t.deletedAt || t.status !== "active") {
		return { tenancy_id: tenancyId, inserted: 0, skipped: "not_active" };
	}
	const horizon = until ?? defaultHorizonUntil();
	// "Future" starts at the beginning of today in London, not the current
	// instant — so a session at 09:00 today is still materialised when
	// Fill is clicked at 11:00.
	const now = startOfTodayLondon();
	const lines = await listLinesForTenancy(t.id);
	const scheduledLines = lines.filter((l) => l.kind === "scheduled");
	// Self-heal: wipe every un-invoiced, non-cancelled future session for
	// the whole tenancy before iterating lines. This catches orphan rows
	// left behind when a line was deleted/replaced, stale rows from a
	// previous schedule that we've since corrected (e.g. timezone fix),
	// and per-line duplicates created across runs. Invoiced and explicitly
	// cancelled sessions are always preserved.
	const wipeResult = await db
		.delete(tenancy_session)
		.where(
			and(
				eq(tenancy_session.tenancy_id, t.id),
				isNull(tenancy_session.invoice_id),
				ne(tenancy_session.status, "cancelled"),
				gte(tenancy_session.starts_at, now),
			),
		)
		.returning({ id: tenancy_session.id });
	const wiped = wipeResult.length;

	// After the wipe, the only future sessions that survive are billed
	// (attached to a real invoice) or explicitly cancelled. Don't insert
	// new sessions at the same starts_at as any of those — that's how
	// duplicates were creeping in.
	const survivors = await db
		.select({ starts_at: tenancy_session.starts_at })
		.from(tenancy_session)
		.where(
			and(
				eq(tenancy_session.tenancy_id, t.id),
				isNull(tenancy_session.deletedAt),
				gte(tenancy_session.starts_at, now),
			),
		);
	const alreadyAt = new Set(
		survivors.map((r) => new Date(r.starts_at).toISOString()),
	);

	let inserted = 0;
	const errors = [];
	for (const line of scheduledLines) {
		try {
			const want = generateSessionDates(
				line,
				{ starts_on: t.starts_on, ends_on: t.ends_on },
				{ from: now, until: horizon },
			);
			const fresh = want.filter(
				(s) => !alreadyAt.has(s.starts_at.toISOString()),
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
				// Once we've inserted at a given starts_at, remember it so
				// a later line in the same run can't double-insert either.
				for (const s of fresh) alreadyAt.add(s.starts_at.toISOString());
				inserted += fresh.length;
			}
		} catch (err) {
			errors.push({ line_id: line.id, error: err?.message || String(err) });
		}
	}
	return { tenancy_id: t.id, inserted, wiped, errors };
}

/**
 * Soft-delete future sessions for a tenancy that:
 *   - haven't been attached to an invoice yet (free to recreate)
 *   - and EITHER belong to no line (orphaned by a `replaceLines` call)
 *     OR belong to a line that's no longer in the supplied keepLineIds set.
 *
 * Used by the update flow: after `replaceLines` swaps out the line rows,
 * sessions referencing the old lines have their FK set to null. We bin
 * those (along with any future un-invoiced ones from kept lines, if asked)
 * before re-materialising against the fresh line definitions.
 */
export async function pruneFutureSessions(tenancyId, { keepLineIds = null } = {}) {
	const now = new Date();
	const rows = await db
		.select({
			id: tenancy_session.id,
			tenancy_line_id: tenancy_session.tenancy_line_id,
			invoice_id: tenancy_session.invoice_id,
		})
		.from(tenancy_session)
		.where(
			and(
				eq(tenancy_session.tenancy_id, tenancyId),
				isNull(tenancy_session.deletedAt),
				gte(tenancy_session.starts_at, now),
			),
		);
	const toDelete = rows
		.filter((r) => !r.invoice_id) // never delete invoiced sessions
		.filter((r) => {
			if (r.tenancy_line_id == null) return true; // orphan from replaceLines
			if (keepLineIds == null) return true;
			return !keepLineIds.has(r.tenancy_line_id);
		})
		.map((r) => r.id);
	if (toDelete.length === 0) return { deleted: 0 };
	const deletedAt = new Date();
	for (const id of toDelete) {
		await db
			.update(tenancy_session)
			.set({ deletedAt, status: "cancelled", cancelled_reason: "tenancy updated" })
			.where(eq(tenancy_session.id, id));
	}
	return { deleted: toDelete.length };
}

/**
 * Top up `tenancy_session` rows through `until` for every active tenancy
 * at the given venue. Iterates each scheduled tenancy_line - occupancy
 * lines produce no sessions. Idempotent: existing rows in the future
 * window are skipped on (line, starts_at).
 */
export async function materialiseSessionsThrough(venueId, until) {
	const tenancies = await listActiveTenancies(venueId);
	const results = [];
	for (const t of tenancies) {
		const r = await materialiseSessionsForTenancy(t.id, { until });
		results.push(r);
	}
	return results;
}
