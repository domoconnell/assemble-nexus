import { listActiveVenues } from "@/db/queries/venue.js";
import {
	getBoardReportRecipients,
	getBoardReportHistory,
	appendBoardReportSent,
} from "@/db/queries/settings.js";
import { currentMonthLondon, prevMonth, monthLabel } from "@/lib/finance/months.js";
import { buildBoardPackPdf } from "@/lib/board-pack/render.js";
import { uploadBoardPackToS3 } from "@/lib/board-pack/storage.js";
import { sendBoardPackToRecipients } from "@/lib/board-pack/email.js";

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

async function run({ ym, force }) {
	const targetYm = resolveTargetYm(ym);
	const venues = await listActiveVenues();
	const results = [];

	for (const venue of venues) {
		try {
			const history = await getBoardReportHistory(venue.id);
			const alreadySent = (history.sent ?? []).some((s) => s.ym === targetYm);
			if (alreadySent && !force) {
				results.push({
					venue: venue.slug,
					ym: targetYm,
					skipped: "already_sent",
				});
				continue;
			}

			const recipientsSetting = await getBoardReportRecipients(venue.id);
			const recipients = recipientsSetting?.recipients ?? [];

			const { buffer, data } = await buildBoardPackPdf({
				venueId: venue.id,
				ym: targetYm,
				venueName: venue.name,
			});

			const { url: downloadUrl } = await uploadBoardPackToS3(
				buffer,
				venue.slug,
				targetYm,
			);

			let emailSummary = { ok: 0, failed: 0, results: [] };
			if (recipients.length > 0) {
				emailSummary = await sendBoardPackToRecipients({
					recipients,
					pdfBuffer: buffer,
					venueName: venue.name,
					ym: targetYm,
					monthLabel: data.monthLabel,
					downloadUrl,
				});
			}

			await appendBoardReportSent(venue.id, {
				ym: targetYm,
				at: new Date().toISOString(),
				download_url: downloadUrl,
				recipients_count: recipients.length,
				emails_sent: emailSummary.ok,
				emails_failed: emailSummary.failed,
			});

			results.push({
				venue: venue.slug,
				ym: targetYm,
				download_url: downloadUrl,
				recipients_count: recipients.length,
				emails_sent: emailSummary.ok,
				emails_failed: emailSummary.failed,
			});
		} catch (err) {
			console.error(`[monthly-report] ${venue.slug}:`, err?.message || err);
			results.push({
				venue: venue.slug,
				ym: targetYm,
				error: err?.message || String(err),
			});
		}
	}

	return { ran_at: new Date().toISOString(), ym: targetYm, results };
}

function readFlags(req) {
	const url = new URL(req.url);
	return {
		ym: url.searchParams.get("month"),
		force: url.searchParams.get("force") === "1",
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
