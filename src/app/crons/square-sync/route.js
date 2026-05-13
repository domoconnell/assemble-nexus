import { db } from "@/db/index.js";
import { venue } from "@/db/schema/entities/venue.js";
import { and, eq, isNull } from "drizzle-orm";
import { getSquareSettings } from "@/db/queries/settings.js";
import { upsertPosDailyTakings } from "@/db/queries/finance.js";
import { syncSquareDailyTakings, squareConfig } from "@/lib/finance/square.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LOOKBACK_DAYS = 3; // overlap to catch late-settling orders

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

function ymdLondon(d) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/London",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(d);
}

function addDaysYmd(ymd, delta) {
	const [y, m, day] = ymd.split("-").map(Number);
	const d = new Date(Date.UTC(y, m - 1, day));
	d.setUTCDate(d.getUTCDate() + delta);
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

async function runSync({ lookbackDays }) {
	const venues = await db
		.select({ id: venue.id, name: venue.name })
		.from(venue)
		.where(and(eq(venue.is_active, true), isNull(venue.deletedAt)));

	const today = new Date();
	const toYmd = ymdLondon(today);
	const fromYmd = addDaysYmd(toYmd, -lookbackDays);

	const results = [];
	for (const v of venues) {
		try {
			const settings = await getSquareSettings(v.id);
			const cfg = squareConfig(settings);
			if (!cfg.configured) {
				results.push({ venue: v.name, ok: false, reason: "not-configured" });
				continue;
			}
			const days = await syncSquareDailyTakings({
				fromYmd,
				toYmd,
				settings,
			});
			for (const day of days) {
				await upsertPosDailyTakings(v.id, day);
			}
			results.push({
				venue: v.name,
				ok: true,
				days_synced: days.length,
				from: fromYmd,
				to: toYmd,
				env: cfg.env,
			});
		} catch (err) {
			results.push({
				venue: v.name,
				ok: false,
				error: err?.message || String(err),
			});
		}
	}
	return results;
}

function parseLookback(url) {
	const raw = url.searchParams.get("lookback_days");
	const n = Number.parseInt(raw ?? "", 10);
	if (Number.isFinite(n) && n >= 0 && n <= 90) return n;
	return DEFAULT_LOOKBACK_DAYS;
}

export async function GET(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	const url = new URL(req.url);
	const lookbackDays = parseLookback(url);
	const results = await runSync({ lookbackDays });
	return Response.json({ ran_at: new Date().toISOString(), lookback_days: lookbackDays, results });
}

export async function POST(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	const url = new URL(req.url);
	const lookbackDays = parseLookback(url);
	const results = await runSync({ lookbackDays });
	return Response.json({ ran_at: new Date().toISOString(), lookback_days: lookbackDays, results });
}
