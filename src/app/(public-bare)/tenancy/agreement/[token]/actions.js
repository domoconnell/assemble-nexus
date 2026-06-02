"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import {
	getAgreementByToken,
	listLinesForTenancy,
	updateAgreement,
} from "@/db/queries/tenancies.js";
import { getVenueById } from "@/db/queries/venue.js";
import { sendTenancyAgreementSignedEmail } from "@/utils/email/tenancy-emails.js";
import { buildAgreementVars, renderAgreementHtml } from "@/lib/tenancies/agreement.js";
import { buildTenancyAgreementPdfBuffer } from "@/lib/tenancies/agreement-pdf.js";
import { uploadFile } from "@/utils/files/files.server.js";

const SignSchema = z.object({
	token: z.string().min(1),
	signed_by_name: z.string().min(1).max(200),
});

/**
 * Record a tenant's digital signature on a specific tenancy agreement.
 * Idempotent: re-signing a row already in the `signed` state is a no-op.
 *
 * Returns the next URL the tenant should be sent to:
 *   - if the tenancy has no active direct debit AND has a dd_token,
 *     return that DD setup URL so the agreement page can chain them
 *     through;
 *   - otherwise, null (the page renders its own "signed, all done" UI).
 */
export async function signTenancyAgreementAction(input) {
	const parsed = SignSchema.parse(input);
	const result = await getAgreementByToken(parsed.token);
	if (!result) throw new Error("Agreement not found or token expired.");
	const { agreement, tenancy } = result;

	if (agreement.status === "cancelled") {
		throw new Error("This agreement has been cancelled. Contact the venue.");
	}

	if (agreement.expires_at && new Date(agreement.expires_at) < new Date()) {
		throw new Error("This sign link has expired. Contact the venue for a fresh link.");
	}

	if (agreement.status === "signed") {
		// Already signed; just return the next-step hint.
		return {
			ok: true,
			already_signed: true,
			next_url:
				tenancy.org_dd_token && !tenancy.org_direct_debit_ready_at
					? `/tenancy/${tenancy.org_dd_token}/direct-debit`
					: null,
		};
	}

	const hdrs = await headers();
	const ip =
		hdrs.get("x-forwarded-for")?.split(",")[0].trim() ||
		hdrs.get("x-real-ip") ||
		null;

	const signed = await updateAgreement(agreement.id, {
		status: "signed",
		signed_at: new Date(),
		signed_by_name: parsed.signed_by_name.trim(),
		signed_by_ip: ip,
	});

	// Render the signed agreement to PDF, persist a copy on S3 via the
	// shared `file` table, and reuse the same buffer for the email
	// attachment. Best-effort: if the upload fails, the agreement stays
	// signed and the email still goes out without the attachment.
	let pdfBuffer = null;
	try {
		const venue = await getVenueById(tenancy.venue_id);
		const lines = await listLinesForTenancy(tenancy.id);
		const renderedHtml = renderAgreementHtml(
			signed.html ?? "",
			buildAgreementVars({ tenancy, venue, lines }),
		);
		pdfBuffer = await buildTenancyAgreementPdfBuffer({
			html: renderedHtml,
			venue,
			tenancy,
			agreement: signed,
			lines,
		});
		const orgSlug = slugify(tenancy.organisation_name) || "signed";
		const uploaded = await uploadFile(pdfBuffer, {
			originalName: `tenancy-agreement-${orgSlug}.pdf`,
			mimeType: "application/pdf",
			fileType: "tenancy-agreement",
			isPublic: false,
		});
		await updateAgreement(signed.id, { pdf_file_id: uploaded.id });
	} catch (err) {
		console.error("[tenancy-agreement-pdf] persist failed", err?.message || err);
	}

	revalidatePath(`/tenancy/agreement/${parsed.token}`);
	revalidatePath(`/admin/tenancies/${tenancy.id}`);

	await sendTenancyAgreementSignedEmail({
		tenancy,
		agreement: signed,
		contactEmail: tenancy.contact_email,
		contactFirstName: tenancy.contact_first_name,
		pdfBuffer,
	});

	return {
		ok: true,
		already_signed: false,
		next_url:
			tenancy.org_dd_token && !tenancy.org_direct_debit_ready_at
				? `/tenancy/${tenancy.org_dd_token}/direct-debit`
				: null,
	};
}

function slugify(s) {
	return String(s ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
}
