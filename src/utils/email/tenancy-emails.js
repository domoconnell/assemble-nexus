import { sendTemplate } from "./email.service.js";
import { getEmailTemplate } from "./templates.js";
import { getVenueById } from "@/db/queries/venue.js";

function baseUrl() {
	return (process.env.BASE_URL || "").replace(/\/$/, "");
}

async function safeSend(templateKey, to, data, { attachments } = {}) {
	if (!to) return;
	// Templates without a SendGrid id yet are expected during dev; skip
	// silently rather than spamming console.error on every flow that
	// touches them. Real send failures still log.
	const entry = getEmailTemplate(templateKey);
	if (!entry.templateId) {
		console.info(`[email:${templateKey}] not wired in SendGrid yet - skipping send.`);
		return;
	}
	try {
		await sendTemplate(templateKey, to, data, attachments ? { attachments } : undefined);
	} catch (err) {
		console.error(`[email:${templateKey}]`, err?.message || err);
	}
}

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short", day: "numeric", month: "long", year: "numeric",
	hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
});

function deriveRoomNames(lines) {
	if (!Array.isArray(lines)) return "";
	return Array.from(new Set(lines.map((l) => l.room_name).filter(Boolean))).join(", ");
}

function dayOfMonthLabel(d) {
	const n = Number(d) || 1;
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * Dual-purpose "welcome" email. Sent when the admin clicks "Send welcome
 * email" on a tenancy that has a draft agreement, no signed agreement, and
 * no active DD. The link goes to the agreement-sign page; signing there
 * chains the tenant on to DD setup automatically.
 */
export async function sendTenancyWelcomeEmail({ tenancy, agreement, contactEmail, contactFirstName, lines }) {
	const venue = await getVenueById(tenancy.venue_id);
	await safeSend("tenancy-welcome", contactEmail, {
		venue_name: venue?.name ?? "",
		first_name: contactFirstName ?? "",
		organisation_name: tenancy.organisation_name ?? "",
		room_name: deriveRoomNames(lines),
		agreement_url: `${baseUrl()}/tenancy/agreement/${agreement.token}`,
	});
}

/**
 * Sent when an admin clicks "Send" on an individual agreement (drafted or
 * re-issued). Always points at the agreement-sign URL; if the tenancy
 * still needs DD, signing there will chain to DD setup.
 */
export async function sendTenancyAgreementSendEmail({ tenancy, agreement, contactEmail, contactFirstName, lines }) {
	const venue = await getVenueById(tenancy.venue_id);
	await safeSend("tenancy-agreement-send", contactEmail, {
		venue_name: venue?.name ?? "",
		first_name: contactFirstName ?? "",
		organisation_name: tenancy.organisation_name ?? "",
		room_name: deriveRoomNames(lines),
		agreement_url: `${baseUrl()}/tenancy/agreement/${agreement.token}`,
	});
}

/**
 * Send the post-signature confirmation. The caller must pass `pdfBuffer`
 * (the rendered, signed agreement) so the same bytes that just got
 * persisted to S3 are attached to the email - one source of truth, no
 * second render.
 */
export async function sendTenancyAgreementSignedEmail({
	tenancy,
	agreement,
	contactEmail,
	contactFirstName,
	pdfBuffer,
}) {
	const venue = await getVenueById(tenancy.venue_id);
	const ddUrl =
		tenancy.org_dd_token && !tenancy.org_direct_debit_ready_at
			? `${baseUrl()}/tenancy/${tenancy.org_dd_token}/direct-debit`
			: "";

	const attachments = pdfBuffer
		? [
			{
				content: pdfBuffer.toString("base64"),
				filename:
					`tenancy-agreement-${slugify(tenancy.organisation_name) || "signed"}.pdf`,
				type: "application/pdf",
				disposition: "attachment",
			},
		]
		: undefined;

	await safeSend("tenancy-agreement-signed", contactEmail, {
		venue_name: venue?.name ?? "",
		first_name: contactFirstName ?? "",
		organisation_name: tenancy.organisation_name ?? "",
		signed_at: agreement?.signed_at
			? dateTimeFmt.format(new Date(agreement.signed_at))
			: "",
		direct_debit_url: ddUrl,
		needs_direct_debit: !!ddUrl,
	}, { attachments });
}

function slugify(s) {
	return String(s ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
}

export async function sendTenancyAgreementCancelledEmail({ tenancy, agreement, contactEmail, contactFirstName }) {
	const venue = await getVenueById(tenancy.venue_id);
	await safeSend("tenancy-agreement-cancelled", contactEmail, {
		venue_name: venue?.name ?? "",
		first_name: contactFirstName ?? "",
		organisation_name: tenancy.organisation_name ?? "",
		cancelled_reason: agreement?.cancelled_reason ?? "",
	});
}

/**
 * Stand-alone "please set up your direct debit" email. Sent to the
 * organisation's primary contact - the mandate is owned by the org so
 * one email serves any number of tenancies / one-off charges.
 */
export async function sendOrganisationDdSetupEmail({ organisation, contactEmail, contactFirstName }) {
	const venue = await getVenueById(organisation.venue_id);
	await safeSend("tenancy-dd-setup", contactEmail, {
		venue_name: venue?.name ?? "",
		first_name: contactFirstName ?? "",
		organisation_name: organisation.name ?? "",
		direct_debit_url: `${baseUrl()}/tenancy/${organisation.dd_token}/direct-debit`,
	});
}

/**
 * Confirmation that the mandate was captured successfully. The
 * invoice-day note is omitted because a single org can have many
 * tenancies on different days; the welcome / agreement emails carry
 * the per-tenancy detail when each tenancy is set up.
 */
export async function sendOrganisationDdReadyEmail({ organisation, contactEmail, contactFirstName }) {
	const venue = await getVenueById(organisation.venue_id);
	await safeSend("tenancy-dd-ready", contactEmail, {
		venue_name: venue?.name ?? "",
		first_name: contactFirstName ?? "",
		organisation_name: organisation.name ?? "",
		invoice_day_of_month: "",
	});
}
