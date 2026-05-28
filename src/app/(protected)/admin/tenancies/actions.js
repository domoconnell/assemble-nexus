"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { getTenancyAgreementTemplate } from "@/db/queries/settings.js";
import {
	insertTenancy,
	updateTenancy,
	softDeleteTenancy,
	cancelSession,
	uncancelSession,
	getTenancyById,
	insertAgreement,
	updateAgreement,
	getAgreementById,
	getActiveAgreement,
	listAgreementsForTenancy,
	getInvoiceById,
	updateInvoice,
} from "@/db/queries/tenancies.js";
import {
	sendTenancyAgreementSendEmail,
	sendTenancyAgreementCancelledEmail,
	sendTenancyWelcomeEmail,
} from "@/utils/email/tenancy-emails.js";

const WeekdaySchema = z.enum(["SU", "MO", "TU", "WE", "TH", "FR", "SA"]);
const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const YmdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CreateSchema = z
	.object({
		kind: z.enum(["private_rental", "scheduled_recurring"]),
		organisation_id: z.string().uuid(),
		contact_id: z.string().uuid().optional().nullable(),
		room_id: z.string().uuid(),
		label: z.string().max(200).optional().nullable(),
		starts_on: YmdSchema,
		ends_on: YmdSchema.optional().nullable().or(z.literal("")),
		invoice_day_of_month: z.coerce.number().int().min(1).max(28).default(1),
		monthly_rate_cents: z.coerce.number().int().min(0).optional().nullable(),
		per_session_rate_cents: z.coerce.number().int().min(0).optional().nullable(),
		schedule_rule: z
			.object({
				by_weekday: z.array(WeekdaySchema).min(1),
				time_start: TimeSchema,
				time_end: TimeSchema,
			})
			.optional()
			.nullable(),
		notes: z.string().max(2000).optional().nullable(),
	})
	.refine(
		(d) =>
			d.kind === "private_rental"
				? d.monthly_rate_cents != null && d.monthly_rate_cents > 0
				: true,
		{ message: "Private rentals need a monthly rate.", path: ["monthly_rate_cents"] },
	)
	.refine(
		(d) =>
			d.kind === "scheduled_recurring"
				? d.schedule_rule && d.per_session_rate_cents != null
				: true,
		{ message: "Recurring tenancies need a schedule and a per-session rate.", path: ["schedule_rule"] },
	);

async function gate() {
	await requireServerSession({ redirectTo: "/auth/login" });
	return requireCurrentVenue();
}

function newToken() {
	return randomBytes(24).toString("base64url");
}

export async function createTenancyAction(input) {
	const venue = await gate();
	const parsed = CreateSchema.parse(input);
	const template = await getTenancyAgreementTemplate(venue.id);
	const row = await insertTenancy({
		venue_id: venue.id,
		organisation_id: parsed.organisation_id,
		contact_id: parsed.contact_id ?? null,
		room_id: parsed.room_id,
		kind: parsed.kind,
		status: "active",
		label: parsed.label?.trim() || null,
		starts_on: parsed.starts_on,
		ends_on: parsed.ends_on?.trim() || null,
		invoice_day_of_month: parsed.invoice_day_of_month,
		monthly_rate_cents: parsed.kind === "private_rental" ? parsed.monthly_rate_cents : null,
		per_session_rate_cents:
			parsed.kind === "scheduled_recurring" ? parsed.per_session_rate_cents : null,
		schedule_rule:
			parsed.kind === "scheduled_recurring" ? parsed.schedule_rule : null,
		notes: parsed.notes?.trim() || null,
	});
	// Seed the first draft agreement from the venue template, so the admin
	// can immediately review/edit/send without an extra "create draft" click.
	await insertAgreement({
		tenancy_id: row.id,
		status: "draft",
		html: template?.html || "",
		token: newToken(),
	});
	revalidatePath("/admin/tenancies");
	return { id: row.id };
}

const UpdateSchema = z.object({
	id: z.string().uuid(),
	label: z.string().max(200).optional().nullable(),
	ends_on: YmdSchema.optional().nullable().or(z.literal("")),
	invoice_day_of_month: z.coerce.number().int().min(1).max(28).optional(),
	monthly_rate_cents: z.coerce.number().int().min(0).optional().nullable(),
	per_session_rate_cents: z.coerce.number().int().min(0).optional().nullable(),
	schedule_rule: z
		.object({
			by_weekday: z.array(WeekdaySchema).min(1),
			time_start: TimeSchema,
			time_end: TimeSchema,
		})
		.optional()
		.nullable(),
	notes: z.string().max(2000).optional().nullable(),
	status: z.enum(["active", "paused", "ended"]).optional(),
});

export async function updateTenancyAction(input) {
	await gate();
	const parsed = UpdateSchema.parse(input);
	const { id, ...rest } = parsed;
	const patch = { ...rest };
	if ("ends_on" in patch) patch.ends_on = patch.ends_on?.trim() || null;
	if ("label" in patch) patch.label = patch.label?.trim() || null;
	if ("notes" in patch) patch.notes = patch.notes?.trim() || null;
	const row = await updateTenancy(id, patch);
	revalidatePath("/admin/tenancies");
	revalidatePath(`/admin/tenancies/${id}`);
	return row;
}

export async function deleteTenancyAction(id) {
	await gate();
	await softDeleteTenancy(id);
	revalidatePath("/admin/tenancies");
	return { ok: true };
}

export async function cancelSessionAction({ session_id, reason }) {
	await gate();
	const row = await cancelSession(session_id, reason);
	if (row?.tenancy_id) revalidatePath(`/admin/tenancies/${row.tenancy_id}`);
	return { ok: true };
}

export async function uncancelSessionAction(session_id) {
	await gate();
	const row = await uncancelSession(session_id);
	if (row?.tenancy_id) revalidatePath(`/admin/tenancies/${row.tenancy_id}`);
	return { ok: true };
}

/* ---------------- agreements ---------------- */

/**
 * Spin up a new draft agreement for a tenancy. Copies the current venue
 * template HTML and generates a fresh public token. Refuses if there's
 * already an open (non-cancelled) agreement - admin must cancel that one
 * first, so the tenant never has two live links at once.
 */
export async function createDraftAgreementAction(tenancyId) {
	const venue = await gate();
	const t = await getTenancyById(tenancyId, { venueId: venue.id });
	if (!t) throw new Error("Tenancy not found.");
	const existing = await getActiveAgreement(t.id);
	if (existing && existing.status !== "signed") {
		throw new Error(
			"There is already an open agreement. Cancel it before creating a new draft.",
		);
	}
	const template = await getTenancyAgreementTemplate(venue.id);
	const row = await insertAgreement({
		tenancy_id: t.id,
		status: "draft",
		html: template?.html || "",
		token: newToken(),
	});
	revalidatePath(`/admin/tenancies/${t.id}`);
	return { id: row.id };
}

const UpdateDraftSchema = z.object({
	id: z.string().uuid(),
	html: z.string().min(1).max(200_000),
});

export async function updateDraftAgreementAction(input) {
	const venue = await gate();
	const parsed = UpdateDraftSchema.parse(input);
	const ag = await getAgreementById(parsed.id);
	if (!ag) throw new Error("Agreement not found.");
	if (ag.status !== "draft") {
		throw new Error("Only draft agreements can be edited.");
	}
	const t = await getTenancyById(ag.tenancy_id, { venueId: venue.id });
	if (!t) throw new Error("Tenancy not found.");
	await updateAgreement(parsed.id, { html: parsed.html });
	revalidatePath(`/admin/tenancies/${ag.tenancy_id}`);
	return { ok: true };
}

/**
 * Move a draft agreement to "sent" and email the tenant a sign link.
 * Refuses if there's no contact email (we don't silently swallow a send).
 */
export async function sendAgreementAction(agreementId) {
	const venue = await gate();
	const ag = await getAgreementById(agreementId);
	if (!ag) throw new Error("Agreement not found.");
	if (ag.status !== "draft") {
		throw new Error("Only draft agreements can be sent.");
	}
	const t = await getTenancyById(ag.tenancy_id, { venueId: venue.id });
	if (!t) throw new Error("Tenancy not found.");
	if (!t.contact_email) {
		throw new Error(
			"No contact email on this tenancy. Assign a contact in the CRM, or set the organisation's primary contact.",
		);
	}
	const updated = await updateAgreement(agreementId, {
		status: "sent",
		sent_at: new Date(),
	});
	await sendTenancyAgreementSendEmail({
		tenancy: t,
		agreement: updated,
		contactEmail: t.contact_email,
		contactFirstName: t.contact_first_name,
	});
	revalidatePath(`/admin/tenancies/${ag.tenancy_id}`);
	return { ok: true };
}

const CancelSchema = z.object({
	id: z.string().uuid(),
	reason: z.string().max(500).optional().nullable(),
});

/**
 * Cancel an agreement at any stage (draft, sent, or signed). For draft we
 * just bin it; for sent we email the tenant so they don't act on the
 * stale link; for signed it acts as a supersede - the signing record is
 * preserved (signed_at + signer remain) but the agreement is flagged
 * cancelled so a fresh one can be issued. After this, admin can spin up
 * a new draft.
 */
export async function cancelAgreementAction(input) {
	const venue = await gate();
	const parsed = CancelSchema.parse(input);
	const ag = await getAgreementById(parsed.id);
	if (!ag) throw new Error("Agreement not found.");
	if (ag.status === "cancelled") return { ok: true };
	const t = await getTenancyById(ag.tenancy_id, { venueId: venue.id });
	if (!t) throw new Error("Tenancy not found.");
	const reason = parsed.reason?.trim() || null;
	const updated = await updateAgreement(parsed.id, {
		status: "cancelled",
		cancelled_at: new Date(),
		cancelled_reason: reason,
	});
	// Notify the tenant when the link/agreement has actually been seen
	// (sent or signed). A silently-cancelled draft they never received
	// doesn't warrant an email.
	if ((ag.status === "sent" || ag.status === "signed") && t.contact_email) {
		await sendTenancyAgreementCancelledEmail({
			tenancy: t,
			agreement: updated,
			contactEmail: t.contact_email,
			contactFirstName: t.contact_first_name,
		});
	}
	revalidatePath(`/admin/tenancies/${ag.tenancy_id}`);
	return { ok: true };
}

/**
 * "Send welcome email" - the dual-purpose initial nudge. Only valid when:
 *   - there is a draft agreement ready to send (we'll mark it "sent")
 *   - there is no existing signed agreement
 *   - the organisation has no active direct debit yet
 *
 * The link goes to the agreement sign page; signing there chains the
 * tenant on to DD setup. Backstops the per-agreement send button on the
 * normal happy path.
 */
export async function sendWelcomeEmailAction(tenancyId) {
	const venue = await gate();
	const t = await getTenancyById(tenancyId, { venueId: venue.id });
	if (!t) throw new Error("Tenancy not found.");
	if (!t.contact_email) {
		throw new Error(
			"No contact email on this tenancy. Assign a contact in the CRM, or set the organisation's primary contact.",
		);
	}
	if (t.org_direct_debit_ready_at) {
		throw new Error("This organisation already has an active direct debit.");
	}
	const all = await listAgreementsForTenancy(t.id);
	if (all.some((a) => a.status === "signed")) {
		throw new Error("This tenancy already has a signed agreement.");
	}
	const draft = all.find((a) => a.status === "draft");
	if (!draft) {
		throw new Error("No draft agreement to send. Create one first.");
	}
	const updated = await updateAgreement(draft.id, {
		status: "sent",
		sent_at: new Date(),
	});
	await sendTenancyWelcomeEmail({
		tenancy: t,
		agreement: updated,
		contactEmail: t.contact_email,
		contactFirstName: t.contact_first_name,
	});
	revalidatePath(`/admin/tenancies/${t.id}`);
	return { ok: true };
}

/* ---------------- invoices ---------------- */

const MarkPaidSchema = z.object({
	id: z.string().uuid(),
	paid_on: YmdSchema,
});

/**
 * Manually flip a tenancy_invoice to `paid`. Used until the Stripe Bacs
 * webhook lands - admins reconcile against the bank statement and tick
 * each invoice off here. `paid_on` is a YYYY-MM-DD picked in the UI;
 * persisted as midday Europe/London so DST doesn't flip the stored date
 * into the wrong UK day.
 */
export async function markTenancyInvoicePaidAction(input) {
	const venue = await gate();
	const parsed = MarkPaidSchema.parse(input);
	const inv = await getInvoiceById(parsed.id, { venueId: venue.id });
	if (!inv) throw new Error("Invoice not found.");
	if (inv.status === "paid") return { ok: true, already: true };
	if (inv.status === "void") {
		throw new Error("Voided invoices cannot be marked paid - re-issue instead.");
	}
	const paid_at = new Date(`${parsed.paid_on}T12:00:00Z`);
	await updateInvoice(parsed.id, {
		status: "paid",
		paid_at,
	});
	revalidatePath(`/admin/tenancies/${inv.tenancy_id}`);
	return { ok: true };
}

/**
 * Mark an invoice as void (cancelled). Use for invoices generated by
 * mistake or superseded. Does not refund any real Stripe charge - that's
 * a separate concern.
 */
export async function voidTenancyInvoiceAction(invoiceId) {
	const venue = await gate();
	const inv = await getInvoiceById(invoiceId, { venueId: venue.id });
	if (!inv) throw new Error("Invoice not found.");
	if (inv.status === "void") return { ok: true, already: true };
	if (inv.status === "paid") {
		throw new Error("Paid invoices cannot be voided.");
	}
	await updateInvoice(invoiceId, { status: "void" });
	revalidatePath(`/admin/tenancies/${inv.tenancy_id}`);
	return { ok: true };
}

/**
 * Reverse a manual "Mark paid" - if it was clicked by accident, drop the
 * invoice back to `issued` so it shows up in payments-owed again.
 */
export async function unmarkTenancyInvoicePaidAction(invoiceId) {
	const venue = await gate();
	const inv = await getInvoiceById(invoiceId, { venueId: venue.id });
	if (!inv) throw new Error("Invoice not found.");
	if (inv.status !== "paid") return { ok: true, already: true };
	await updateInvoice(invoiceId, {
		status: "issued",
		paid_at: null,
	});
	revalidatePath(`/admin/tenancies/${inv.tenancy_id}`);
	return { ok: true };
}
