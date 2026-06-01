import {
	getBoardReportHistory,
	appendBoardReportSent,
} from "@/db/queries/settings.js";
import { listStaffUsersSubscribedTo } from "@/db/queries/staff-notifications.js";
import { buildBoardPackPdf } from "./render.js";
import { uploadBoardPackToS3 } from "./storage.js";
import { sendBoardPackToRecipients } from "./email.js";

/**
 * Build + upload + email a board pack for a single venue/month. Used by
 * both the monthly cron and the admin "Send now" / "Resend" server action,
 * so behaviour stays consistent across both entry points.
 *
 * `overrideRecipients` lets a caller bypass the venue's persistent
 * recipient list (e.g. previewing to a single email). When supplied, the
 * call is NOT recorded in `board_report_history` - that's reserved for
 * "real" sends through the configured list.
 *
 * `force=true` lets a caller re-send for a month that's already been
 * recorded in history. Without it, idempotency kicks in and the call
 * short-circuits with `{ skipped: "already_sent" }`.
 */
export async function dispatchBoardPack({
	venue,
	ym,
	force = false,
	overrideRecipients = null,
}) {
	if (!overrideRecipients && !force) {
		const history = await getBoardReportHistory(venue.id);
		if ((history.sent ?? []).some((s) => s.ym === ym)) {
			return { venue: venue.slug, ym, skipped: "already_sent" };
		}
	}

	// Recipient list: when not overridden, pull every admin/staff user
	// who hasn't opted out of `monthly-board-pack` via /admin/users.
	const recipients = overrideRecipients
		? overrideRecipients
		: (await listStaffUsersSubscribedTo("monthly-board-pack")).map((u) => ({
			email: u.email,
			name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
		}));

	const { buffer, data } = await buildBoardPackPdf({
		venueId: venue.id,
		ym,
		venueName: venue.name,
	});

	const { url: downloadUrl } = await uploadBoardPackToS3(
		buffer,
		venue.slug,
		ym,
	);

	let emailSummary = { ok: 0, failed: 0, results: [] };
	if (recipients.length > 0) {
		emailSummary = await sendBoardPackToRecipients({
			recipients,
			pdfBuffer: buffer,
			venueName: venue.name,
			ym,
			monthLabel: data.monthLabel,
			downloadUrl,
		});
	}

	// Only persist to history when we sent to the canonical list - manual
	// `to=` previews don't pollute the audit trail.
	if (!overrideRecipients) {
		await appendBoardReportSent(venue.id, {
			ym,
			at: new Date().toISOString(),
			download_url: downloadUrl,
			recipients_count: recipients.length,
			emails_sent: emailSummary.ok,
			emails_failed: emailSummary.failed,
		});
	}

	return {
		venue: venue.slug,
		ym,
		download_url: downloadUrl,
		recipients_count: recipients.length,
		emails_sent: emailSummary.ok,
		emails_failed: emailSummary.failed,
	};
}
