import { z } from "zod";
import { auth } from "@/utils/auth/auth.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { upsertPosDailyTakings } from "@/db/queries/finance.js";
import { syncSquareDailyTakings, squareConfig } from "@/lib/finance/square.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status, body) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const BodySchema = z.object({
	from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function authorise(request) {
	// Cron header: Authorization: Bearer ${POS_SYNC_TOKEN}
	const token = process.env.POS_SYNC_TOKEN;
	if (token) {
		const header = request.headers.get("authorization") || "";
		if (header === `Bearer ${token}`) return true;
	}
	// Otherwise require an admin session.
	const session = await auth.api.getSession({ headers: request.headers });
	return !!session?.user;
}

export async function POST(request) {
	const ok = await authorise(request);
	if (!ok) return json(401, { error: "Unauthorised" });

	const cfg = squareConfig();
	if (!cfg.configured) {
		return json(412, {
			error: "Square not configured",
			missing: {
				token: !cfg.token,
				location: !cfg.locationId,
			},
		});
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "Invalid JSON" });
	}
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) {
		return json(400, { error: "Invalid request", issues: parsed.error.issues });
	}
	if (parsed.data.from > parsed.data.to) {
		return json(400, { error: "from must be <= to" });
	}

	const venue = await requireCurrentVenue();
	try {
		const days = await syncSquareDailyTakings({
			fromYmd: parsed.data.from,
			toYmd: parsed.data.to,
		});
		for (const day of days) {
			await upsertPosDailyTakings(venue.id, day);
		}
		return json(200, {
			ok: true,
			days_synced: days.length,
			from: parsed.data.from,
			to: parsed.data.to,
		});
	} catch (err) {
		return json(500, { error: err?.message || "Sync failed" });
	}
}
