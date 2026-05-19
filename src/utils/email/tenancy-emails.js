import { sendTemplate } from "./email.service.js";
import { getEmailTemplate } from "./templates.js";
import { getVenueById } from "@/db/queries/venue.js";

function baseUrl() {
	return (process.env.BASE_URL || "").replace(/\/$/, "");
}

async function safeSend(templateKey, to, data) {
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
		await sendTemplate(templateKey, to, data);
	} catch (err) {
		console.error(`[email:${templateKey}]`, err?.message || err);
	}
}

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short", day: "numeric", month: "long", year: "numeric",
	hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
});

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
export async function sendTenancyWelcomeEmail({ tenancy, agreement, contactEmail, contactFirstName }) {
	const venue = await getVenueById(tenancy.venue_id);
	await safeSend("tenancy-welcome", contactEmail, {
		venue_name: venue?.name ?? "",
		first_name: contactFirstName ?? "",
		organisation_name: tenancy.organisation_name ?? "",
		room_name: tenancy.room_name ?? "",
		agreement_url: `${baseUrl()}/tenancy/agreement/${agreement.token}`,
	});
}

/**
 * Sent when an admin clicks "Send" on an individual agreement (drafted or
 * re-issued). Always points at the agreement-sign URL; if the tenancy
 * still needs DD, signing there will chain to DD setup.
 */
export async function sendTenancyAgreementSendEmail({ tenancy, agreement, contactEmail, contactFirstName }) {
	const venue = await getVenueById(tenancy.venue_id);
	await safeSend("tenancy-agreement-send", contactEmail, {
		venue_name: venue?.name ?? "",
		first_name: contactFirstName ?? "",
		organisation_name: tenancy.organisation_name ?? "",
		room_name: tenancy.room_name ?? "",
		agreement_url: `${baseUrl()}/tenancy/agreement/${agreement.token}`,
	});
}

export async function sendTenancyAgreementSignedEmail({ tenancy, agreement, contactEmail, contactFirstName }) {
	const venue = await getVenueById(tenancy.venue_id);
	const ddUrl =
		tenancy.dd_token && !tenancy.direct_debit_ready_at
			? `${baseUrl()}/tenancy/${tenancy.dd_token}/direct-debit`
			: "";
	await safeSend("tenancy-agreement-signed", contactEmail, {
		venue_name: venue?.name ?? "",
		first_name: contactFirstName ?? "",
		organisation_name: tenancy.organisation_name ?? "",
		signed_at: agreement?.signed_at
			? dateTimeFmt.format(new Date(agreement.signed_at))
			: "",
		direct_debit_url: ddUrl,
		needs_direct_debit: !!ddUrl,
	});
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
 * Stand-alone "please set up your direct debit" email. Used when the
 * agreement is already in place (or won't be sent at all) but the
 * tenant still needs to set up the mandate.
 */
export async function sendTenancyDdSetupEmail({ tenancy, contactEmail, contactFirstName }) {
	const venue = await getVenueById(tenancy.venue_id);
	await safeSend("tenancy-dd-setup", contactEmail, {
		venue_name: venue?.name ?? "",
		first_name: contactFirstName ?? "",
		organisation_name: tenancy.organisation_name ?? "",
		direct_debit_url: `${baseUrl()}/tenancy/${tenancy.dd_token}/direct-debit`,
	});
}

export async function sendTenancyDdReadyEmail({ tenancy, contactEmail, contactFirstName }) {
	const venue = await getVenueById(tenancy.venue_id);
	await safeSend("tenancy-dd-ready", contactEmail, {
		venue_name: venue?.name ?? "",
		first_name: contactFirstName ?? "",
		organisation_name: tenancy.organisation_name ?? "",
		invoice_day_of_month: dayOfMonthLabel(tenancy.invoice_day_of_month),
	});
}
