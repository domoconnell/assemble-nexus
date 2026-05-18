import { sendTemplate } from "@/utils/email/email.service.js";

/**
 * Send the board-pack PDF to every recipient. Per-recipient send failures
 * are logged but don't abort the batch - we always try to reach everyone
 * on the list. Returns `{ ok, failed }` counts and an array of
 * per-recipient outcomes.
 *
 * If the `monthly-board-pack` template isn't configured in SendGrid yet
 * the throw from sendTemplate bubbles up per-recipient and is caught, so
 * the cron still completes (the PDF is on S3 either way).
 */
export async function sendBoardPackToRecipients({
	recipients,
	pdfBuffer,
	venueName,
	ym,
	monthLabel,
	downloadUrl,
}) {
	const filename = `board-pack-${ym}.pdf`;
	const attachment = {
		content: pdfBuffer.toString("base64"),
		filename,
		type: "application/pdf",
		disposition: "attachment",
	};

	const results = [];
	let ok = 0;
	let failed = 0;
	for (const r of recipients) {
		if (!r?.email) {
			failed++;
			results.push({ email: r?.email ?? null, ok: false, error: "Missing email" });
			continue;
		}
		try {
			await sendTemplate(
				"monthly-board-pack",
				r.email,
				{
					venue_name: venueName,
					ym,
					month_label: monthLabel,
					recipient_name: r.name ?? "",
					download_url: downloadUrl,
				},
				{ attachments: [attachment] },
			);
			ok++;
			results.push({ email: r.email, ok: true });
		} catch (err) {
			failed++;
			const message = err?.message || String(err);
			console.error(`[board-pack-email] ${r.email}:`, message);
			results.push({ email: r.email, ok: false, error: message });
		}
	}

	return { ok, failed, results };
}
