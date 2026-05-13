export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stub for the nightly Square POS sync. Real implementation lands when we
 * wire up the Square integration — fetches the day's Payments, settles
 * fees, and rolls them into the ledger.
 *
 * Auth: same shared-secret pattern as the bank-sync cron.
 */
function authorized(req) {
	const secret = process.env.CRON_SECRET;
	if (!secret) return false;
	const auth = req.headers.get("authorization") || "";
	if (auth === `Bearer ${secret}`) return true;
	if (req.headers.get("x-cron-secret") === secret) return true;
	return false;
}

async function noop() {
	return {
		ran_at: new Date().toISOString(),
		note: "Square sync is not implemented yet — endpoint reachable for cron-job.org wiring.",
	};
}

export async function POST(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	return Response.json(await noop());
}

export async function GET(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	return Response.json(await noop());
}
