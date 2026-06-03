import { runBankSync } from "@/lib/banking/sync.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nightly cron - sync every active bank account across every venue. The
 * sync service iterates active bank_accounts and dispatches to each
 * account's provider plugin (Starling, Revolut, …) which handles its own
 * auth.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` OR `X-Cron-Secret: <CRON_SECRET>`.
 */
function authorized(req) {
	const secret = process.env.CRON_SECRET;
	if (!secret) return false;
	const auth = req.headers.get("authorization") || "";
	if (auth === `Bearer ${secret}`) return true;
	if (req.headers.get("x-cron-secret") === secret) return true;
	return false;
}

async function run() {
	const results = await runBankSync();
	return { ran_at: new Date().toISOString(), results };
}

export async function GET(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	return Response.json(await run());
}

export async function POST(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	return Response.json(await run());
}
