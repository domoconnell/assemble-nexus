import { listActiveVenues } from "@/db/queries/venue.js";
import { currentMonthLondon, prevMonth } from "@/lib/finance/months.js";
import { dispatchBoardPack } from "@/lib/board-pack/dispatch.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Monthly cron - builds the previous month's board-pack PDF for every
 * active venue, uploads it to S3, and emails it to that venue's
 * configured board-report recipients. Idempotent on a per-(venue, ym)
 * basis: if the venue's history setting already has an entry for the
 * target ym, the run skips that venue. The `force=1` query flag bypasses
 * the skip - useful for re-issuing after editing recipients.
 *
 * `month=YYYY-MM` lets the caller target a specific month, overriding
 * the "previous month from today" default. Handy for backfilling.
 *
 * `to=email,email` overrides the configured recipient list for a
 * one-off preview - the call is not recorded in history.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` or `X-Cron-Secret: <CRON_SECRET>`.
 */
function authorized(req) {
	const secret = process.env.CRON_SECRET;
	if (!secret) return false;
	const auth = req.headers.get("authorization") || "";
	if (auth === `Bearer ${secret}`) return true;
	if (req.headers.get("x-cron-secret") === secret) return true;
	return false;
}

function pad(n) {
	return String(n).padStart(2, "0");
}

function resolveTargetYm(rawYm) {
	if (typeof rawYm === "string" && /^\d{4}-\d{2}$/.test(rawYm)) return rawYm;
	const cur = currentMonthLondon();
	const prev = prevMonth(cur.year, cur.month1);
	return `${prev.year}-${pad(prev.month1)}`;
}

async function run({ ym, force, overrideTo }) {
	const targetYm = resolveTargetYm(ym);
	const venues = await listActiveVenues();
	const overrideRecipients = overrideTo
		? overrideTo
				.split(",")
				.map((e) => ({ email: e.trim(), name: null }))
				.filter((r) => r.email)
		: null;
	const results = [];
	for (const venue of venues) {
		try {
			const result = await dispatchBoardPack({
				venue,
				ym: targetYm,
				force,
				overrideRecipients,
			});
			results.push(result);
		} catch (err) {
			console.error(`[monthly-report] ${venue.slug}:`, err?.message || err);
			results.push({ venue: venue.slug, ym: targetYm, error: err?.message || String(err) });
		}
	}
	return { ran_at: new Date().toISOString(), ym: targetYm, results };
}

function readFlags(req) {
	const url = new URL(req.url);
	return {
		ym: url.searchParams.get("month"),
		force: url.searchParams.get("force") === "1",
		overrideTo: url.searchParams.get("to"),
	};
}

export async function GET(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	return Response.json(await run(readFlags(req)));
}

export async function POST(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	return Response.json(await run(readFlags(req)));
}
