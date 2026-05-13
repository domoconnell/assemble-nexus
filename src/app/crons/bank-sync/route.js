import { db } from "@/db/index.js";
import { venue } from "@/db/schema/entities/venue.js";
import { isNull, eq, and } from "drizzle-orm";
import { syncStarlingForVenue } from "@/lib/finance/bank-sync.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nightly bank-data sync. Designed to be hit by DO App Platform's
 * Scheduled Jobs (or any external cron) with a shared-secret header.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` OR `X-Cron-Secret: <CRON_SECRET>`.
 * Returns a JSON summary of what happened per venue — useful for cron logs.
 */
function authorized(req) {
	const secret = process.env.CRON_SECRET;
	if (!secret) return false;
	const auth = req.headers.get("authorization") || "";
	if (auth === `Bearer ${secret}`) return true;
	if (req.headers.get("x-cron-secret") === secret) return true;
	return false;
}

async function runSync() {
	const venues = await db
		.select({ id: venue.id, name: venue.name })
		.from(venue)
		.where(and(eq(venue.is_active, true), isNull(venue.deletedAt)));
	const results = [];
	for (const v of venues) {
		try {
			const r = await syncStarlingForVenue(v.id);
			results.push({ venue: v.name, ...r });
		} catch (err) {
			results.push({ venue: v.name, ok: false, error: err?.message || String(err) });
		}
	}
	return results;
}

export async function POST(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	const results = await runSync();
	return Response.json({ ran_at: new Date().toISOString(), results });
}

// GET handler for ease of curl-from-cron and manual checks. Same auth.
export async function GET(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	const results = await runSync();
	return Response.json({ ran_at: new Date().toISOString(), results });
}
