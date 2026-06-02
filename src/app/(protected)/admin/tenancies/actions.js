"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { room as roomTable } from "@/db/schema/entities/room.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { getTenancyAgreementTemplate } from "@/db/queries/settings.js";
import { listRoomRackHourlyRates } from "@/db/queries/room-rack-rates.js";
import {
	issueInvoiceForTenancyPeriod,
	chargeTenancyInvoice,
} from "@/lib/tenancies/invoicer.js";
import {
	materialiseSessionsForTenancy,
	pruneFutureSessions,
} from "@/lib/tenancies/materialiser.js";
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
	listLinesForTenancy,
	getInvoiceById,
	updateInvoice,
	softDeleteInvoice,
	freeSessionsFromInvoice,
	replaceLines,
} from "@/db/queries/tenancies.js";
import {
	sendTenancyAgreementSendEmail,
	sendTenancyAgreementCancelledEmail,
	sendTenancyWelcomeEmail,
	sendTenancyInvoiceEmail,
} from "@/utils/email/tenancy-emails.js";
import {
	listUnmatchedInboundTransactions,
	setBankTransactionMatch,
	clearBankTransactionMatch,
	getBankTransactionMatchedTo,
} from "@/db/queries/bank.js";
import { buildTenancyInvoicePdfBuffer } from "@/lib/tenancies/invoice-pdf.js";
import { getVenueById } from "@/db/queries/venue.js";

const WeekdaySchema = z.enum(["SU", "MO", "TU", "WE", "TH", "FR", "SA"]);
const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const YmdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// One entry in tenancy_line.schedule_rule[]. Same shape as before;
// `per_session_rate_cents` has moved up to the line (only meaningful
// when billing_mode === "per_session").
const ScheduleRuleSchema = z.discriminatedUnion("kind", [
	z.object({
		id: z.string().uuid(),
		kind: z.literal("weekly"),
		by_weekday: z.array(WeekdaySchema).min(1),
		interval: z.coerce.number().int().min(1).max(52).default(1),
		time_start: TimeSchema,
		time_end: TimeSchema,
		label: z.string().max(80).optional().nullable(),
	}),
	z.object({
		id: z.string().uuid(),
		kind: z.literal("monthly_nth"),
		by_weekday: z.array(WeekdaySchema).min(1),
		by_set_pos: z.array(
			z.number().int().refine((n) => n === -1 || (n >= 1 && n <= 4), {
				message: "by_set_pos values must be 1, 2, 3, 4, or -1 (last)",
			}),
		).min(1),
		interval: z.coerce.number().int().min(1).max(12).default(1),
		time_start: TimeSchema,
		time_end: TimeSchema,
		label: z.string().max(80).optional().nullable(),
	}),
]);

const LineSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("occupancy"),
		room_id: z.string().uuid(),
		label: z.string().max(120).optional().nullable(),
		monthly_rate_cents: z.coerce.number().int().min(0),
	}),
	z.object({
		kind: z.literal("scheduled"),
		room_id: z.string().uuid(),
		label: z.string().max(120).optional().nullable(),
		schedule_rule: z.array(ScheduleRuleSchema).min(1),
		// Rate fields are optional — when all three are null, the line bills
		// at the room's standard hourly rate (no override). The form +
		// `validateLinesAgainstVenue` enforce that lines on rooms without a
		// configured rack rate must supply a rate.
		billing_mode: z.enum(["per_session", "per_hour", "fixed_monthly"]).optional().nullable(),
		per_session_rate_cents: z.coerce.number().int().min(0).optional().nullable(),
		per_hour_rate_cents: z.coerce.number().int().min(0).optional().nullable(),
		fixed_monthly_rate_cents: z.coerce.number().int().min(0).optional().nullable(),
	}),
]);

const TenancyBaseSchema = z.object({
	organisation_id: z.string().uuid(),
	contact_id: z.string().uuid().optional().nullable(),
	label: z.string().max(200).optional().nullable(),
	starts_on: YmdSchema,
	ends_on: YmdSchema.optional().nullable().or(z.literal("")),
	invoice_day_of_month: z.coerce.number().int().min(1).max(28).default(1),
	monthly_override_cents: z.coerce.number().int().min(0).optional().nullable(),
	auto_bill_via_dd: z.boolean().optional().default(false),
	notes: z.string().max(2000).optional().nullable(),
	lines: z.array(LineSchema).min(1, "A tenancy needs at least one line."),
});

/**
 * Verify every line's room belongs to the venue, and that occupancy
 * lines target a non-public room. Public-room occupancy is illegal —
 * occupancy means "this org has the room full-time," which would conflict
 * with public bookings on the same calendar. Additionally, occupancy
 * lines must have a monthly rate, and scheduled lines without an explicit
 * rate must target a room that has a standard hourly rate configured (so
 * the billing engine has something to fall back to).
 */
async function validateLinesAgainstVenue(lines, venueId) {
	const roomIds = [...new Set(lines.map((l) => l.room_id))];
	const rooms = await db
		.select({ id: roomTable.id, is_public: roomTable.is_public, venue_id: roomTable.venue_id, name: roomTable.name })
		.from(roomTable)
		.where(inArray(roomTable.id, roomIds));
	const byId = new Map(rooms.map((r) => [r.id, r]));

	const needsRackCheck = lines.some(
		(l) =>
			l.kind === "scheduled" &&
			(l.per_session_rate_cents ?? null) == null &&
			(l.per_hour_rate_cents ?? null) == null &&
			(l.fixed_monthly_rate_cents ?? null) == null,
	);
	const rackRatesByRoomId = needsRackCheck
		? await listRoomRackHourlyRates(venueId)
		: {};

	for (const line of lines) {
		const r = byId.get(line.room_id);
		if (!r) throw new Error("Selected room not found.");
		if (r.venue_id !== venueId) throw new Error(`Room "${r.name}" doesn't belong to this venue.`);
		if (line.kind === "occupancy") {
			if (r.is_public) {
				throw new Error(`Room "${r.name}" is public; occupancy lines need a non-public room.`);
			}
			if ((line.monthly_rate_cents ?? 0) <= 0) {
				throw new Error(`Room "${r.name}": occupancy lines need a monthly rate.`);
			}
			continue;
		}
		const noRate =
			(line.per_session_rate_cents ?? null) == null &&
			(line.per_hour_rate_cents ?? null) == null &&
			(line.fixed_monthly_rate_cents ?? null) == null;
		if (noRate) {
			if (!rackRatesByRoomId[r.id]) {
				throw new Error(
					`Room "${r.name}" has no standard hourly rate configured, so a rate is required on this line.`,
				);
			}
			continue;
		}
		if (!line.billing_mode) {
			throw new Error(`Room "${r.name}": choose a billing mode when overriding the rate.`);
		}
	}
}

function buildLineRow(line, sortIndex) {
	if (line.kind === "occupancy") {
		return {
			room_id: line.room_id,
			kind: "occupancy",
			label: line.label?.trim() || null,
			monthly_rate_cents: line.monthly_rate_cents,
			schedule_rule: null,
			billing_mode: null,
			per_session_rate_cents: null,
			per_hour_rate_cents: null,
			fixed_monthly_rate_cents: null,
			sort_order: sortIndex,
		};
	}
	return {
		room_id: line.room_id,
		kind: "scheduled",
		label: line.label?.trim() || null,
		monthly_rate_cents: null,
		schedule_rule: line.schedule_rule,
		billing_mode: line.billing_mode,
		per_session_rate_cents:
			line.billing_mode === "per_session" ? line.per_session_rate_cents ?? null : null,
		per_hour_rate_cents:
			line.billing_mode === "per_hour" ? line.per_hour_rate_cents ?? null : null,
		fixed_monthly_rate_cents:
			line.billing_mode === "fixed_monthly" ? line.fixed_monthly_rate_cents ?? null : null,
		sort_order: sortIndex,
	};
}

const CreateSchema = TenancyBaseSchema;

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
	await validateLinesAgainstVenue(parsed.lines, venue.id);
	const template = await getTenancyAgreementTemplate(venue.id);
	const row = await insertTenancy({
		venue_id: venue.id,
		organisation_id: parsed.organisation_id,
		contact_id: parsed.contact_id ?? null,
		status: "active",
		label: parsed.label?.trim() || null,
		starts_on: parsed.starts_on,
		ends_on: parsed.ends_on?.trim() || null,
		invoice_day_of_month: parsed.invoice_day_of_month,
		monthly_override_cents: parsed.monthly_override_cents ?? null,
		auto_bill_via_dd: parsed.auto_bill_via_dd ?? false,
		notes: parsed.notes?.trim() || null,
	});
	await replaceLines(row.id, parsed.lines.map(buildLineRow));
	// Seed the first draft agreement from the venue template.
	await insertAgreement({
		tenancy_id: row.id,
		status: "draft",
		html: template?.html || "",
		token: newToken(),
	});
	// Materialise the next ~90 days of sessions so the calendar shows
	// them straight away — same horizon the daily cron uses. Best-effort:
	// if generation fails we still return the new tenancy id so the
	// admin can fix the schedule and click "Fill sessions" manually.
	try {
		await materialiseSessionsForTenancy(row.id);
	} catch (err) {
		console.error(`[tenancy-create] materialise failed for ${row.id}:`, err?.message || err);
	}
	revalidatePath("/admin/tenancies");
	return { id: row.id };
}

const UpdateSchema = TenancyBaseSchema.extend({
	id: z.string().uuid(),
	status: z.enum(["active", "paused", "ended"]).optional(),
});

export async function updateTenancyAction(input) {
	const venue = await gate();
	const parsed = UpdateSchema.parse(input);
	await validateLinesAgainstVenue(parsed.lines, venue.id);
	const patch = {
		label: parsed.label?.trim() || null,
		ends_on: parsed.ends_on?.trim() || null,
		invoice_day_of_month: parsed.invoice_day_of_month,
		monthly_override_cents: parsed.monthly_override_cents ?? null,
		auto_bill_via_dd: parsed.auto_bill_via_dd ?? false,
		notes: parsed.notes?.trim() || null,
		contact_id: parsed.contact_id ?? null,
	};
	if (parsed.status) patch.status = parsed.status;
	const row = await updateTenancy(parsed.id, patch);
	await replaceLines(parsed.id, parsed.lines.map(buildLineRow));
	// Session reshuffle: `replaceLines` cascades the old line rows away,
	// which leaves any future un-invoiced sessions orphaned (tenancy_line_id
	// → null). Soft-delete those and then re-materialise against the
	// fresh line definitions. Invoiced sessions are preserved untouched
	// so historical billing stays intact.
	try {
		await pruneFutureSessions(parsed.id);
		if (row.status === "active") {
			await materialiseSessionsForTenancy(parsed.id);
		}
	} catch (err) {
		console.error(`[tenancy-update] reshuffle failed for ${parsed.id}:`, err?.message || err);
	}
	revalidatePath("/admin/tenancies");
	revalidatePath(`/admin/tenancies/${parsed.id}`);
	return row;
}

export async function deleteTenancyAction(id) {
	await gate();
	// Clear future sessions off the calendar before the tenancy itself
	// is soft-deleted, so the public/admin calendar reflects the change
	// immediately. Invoiced sessions are kept so historical billing
	// stays intact.
	try {
		await pruneFutureSessions(id);
	} catch (err) {
		console.error(`[tenancy-delete] prune failed for ${id}:`, err?.message || err);
	}
	await softDeleteTenancy(id);
	revalidatePath("/admin/tenancies");
	revalidatePath(`/admin/tenancies/${id}`);
	return { ok: true };
}

/**
 * Re-run the session materialiser for a tenancy on demand. Bound to the
 * "Fill sessions" button on the tenancy detail page. Idempotent — the
 * materialiser only inserts (line, starts_at) pairs that don't already
 * exist in the future window.
 */
export async function fillTenancySessionsAction(tenancyId) {
	const venue = await gate();
	const t = await getTenancyById(tenancyId, { venueId: venue.id });
	if (!t) throw new Error("Tenancy not found.");
	if (t.status !== "active") {
		throw new Error("Only active tenancies can be filled.");
	}
	const result = await materialiseSessionsForTenancy(tenancyId);
	revalidatePath(`/admin/tenancies/${tenancyId}`);
	return { ok: true, ...result };
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
	const now = new Date();
	const updated = await updateAgreement(agreementId, {
		status: "sent",
		sent_at: now,
		// Sign link is good for 30 days from send. Long enough to chase a
		// slow tenant; short enough that a forwarded link doesn't bind
		// the org months later.
		expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
	});
	const sendLines = await listLinesForTenancy(t.id);
	await sendTenancyAgreementSendEmail({
		tenancy: t,
		agreement: updated,
		contactEmail: t.contact_email,
		contactFirstName: t.contact_first_name,
		lines: sendLines,
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
	const now = new Date();
	const updated = await updateAgreement(draft.id, {
		status: "sent",
		sent_at: now,
		expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
	});
	const welcomeLines = await listLinesForTenancy(t.id);
	await sendTenancyWelcomeEmail({
		tenancy: t,
		agreement: updated,
		contactEmail: t.contact_email,
		contactFirstName: t.contact_first_name,
		lines: welcomeLines,
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
	// Mark the invoice void AND free its sessions so the same work can be
	// re-billed under a fresh invoice. Without this, the next Fill /
	// re-issue would create duplicate session rows alongside the
	// orphaned-but-still-attached ones.
	await freeSessionsFromInvoice(invoiceId);
	await updateInvoice(invoiceId, { status: "void" });
	revalidatePath(`/admin/tenancies/${inv.tenancy_id}`);
	return { ok: true };
}

/**
 * Hard-remove an invoice (soft-delete) — sets `deletedAt` so it no
 * longer shows in any listing and stops blocking a fresh invoice for
 * the same period. Sessions that were attached to it are freed so the
 * regenerated invoice can pick them up.
 *
 * Refuses on paid invoices (use Undo first); paid sessions stay locked
 * to their settled bank line, so we don't risk double-billing.
 */
export async function deleteTenancyInvoiceAction(invoiceId) {
	const venue = await gate();
	const inv = await getInvoiceById(invoiceId, { venueId: venue.id });
	if (!inv) throw new Error("Invoice not found.");
	if (inv.status === "paid") {
		throw new Error("Paid invoices cannot be deleted — undo the payment first.");
	}
	await softDeleteInvoice(invoiceId);
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

const ManualInvoiceSchema = z.object({
	tenancy_id: z.string().uuid(),
	period_ym: z.string().regex(/^\d{4}-\d{2}$/, "Pick a month."),
	issued_on: YmdSchema,
});

/**
 * Admin-triggered "create invoice now". Generates an invoice for the
 * given month using the same engine as the cron, but does NOT auto-bill
 * via DD even if the tenancy is configured for it — the admin can click
 * the "Take by direct debit" button after, so they stay in control of
 * when the charge is submitted.
 */
export async function createTenancyInvoiceAction(input) {
	const venue = await gate();
	const parsed = ManualInvoiceSchema.parse(input);
	const t = await getTenancyById(parsed.tenancy_id, { venueId: venue.id });
	if (!t) throw new Error("Tenancy not found.");
	// Materialise sessions for the target month BEFORE computing the
	// invoice. The daily cron usually keeps the next ~90 days topped up,
	// but on a brand-new tenancy (or after editing the schedule) the
	// admin will hit this before the cron runs — so guarantee the
	// sessions exist before billing them.
	const [y, m] = parsed.period_ym.split("-").map(Number);
	const horizonEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59));
	try {
		await materialiseSessionsForTenancy(t.id, { until: horizonEnd });
	} catch (err) {
		console.error(`[tenancy-invoice] materialise failed for ${t.id}:`, err?.message || err);
	}
	const rackRatesByRoomId = await listRoomRackHourlyRates(venue.id);
	const issuedAt = new Date(`${parsed.issued_on}T12:00:00Z`);
	try {
		const result = await issueInvoiceForTenancyPeriod({
			tenancy: t,
			periodYm: parsed.period_ym,
			rackRatesByRoomId,
			issuedAt,
			attemptAutoBill: false,
		});
		revalidatePath(`/admin/tenancies/${t.id}`);
		if (t.organisation_id) revalidatePath(`/admin/crm/${t.organisation_id}`);
		return { ok: true, invoice_id: result.invoice.id };
	} catch (err) {
		if (err?.code === "already_invoiced") {
			throw new Error(`An invoice for ${parsed.period_ym} already exists for this tenancy.`);
		}
		throw err;
	}
}

/**
 * Submit a Stripe Bacs charge for a single invoice against the org's
 * DD mandate. The button only appears on issued invoices where no
 * charge is in flight, so this action is mostly a thin wrapper around
 * `chargeTenancyInvoice` with venue-scope authorisation.
 */
export async function chargeTenancyInvoiceAction(invoiceId) {
	const venue = await gate();
	const inv = await getInvoiceById(invoiceId, { venueId: venue.id });
	if (!inv) throw new Error("Invoice not found.");
	const t = await getTenancyById(inv.tenancy_id, { venueId: venue.id });
	if (!t) throw new Error("Tenancy not found.");
	const result = await chargeTenancyInvoice({
		invoice: inv,
		tenancy: t,
		venueId: venue.id,
	});
	revalidatePath(`/admin/tenancies/${inv.tenancy_id}`);
	if (t.organisation_id) revalidatePath(`/admin/crm/${t.organisation_id}`);
	return { ok: true, ...result };
}

/**
 * Email the tenant the invoice PDF. Uses the org's primary contact (or
 * the tenancy's contact override). Server action so the admin can click
 * "Send" on an invoice row and have the bytes assembled + delivered in
 * one round-trip.
 */
export async function sendTenancyInvoiceAction(invoiceId) {
	const venue = await gate();
	const inv = await getInvoiceById(invoiceId, { venueId: venue.id });
	if (!inv) throw new Error("Invoice not found.");
	const t = await getTenancyById(inv.tenancy_id, { venueId: venue.id });
	if (!t) throw new Error("Tenancy not found.");
	if (!t.contact_email) {
		throw new Error(
			"No contact email on this tenancy. Add a primary contact on the organisation first.",
		);
	}
	const [lines, venueRow] = await Promise.all([
		(await import("@/db/queries/tenancies.js")).listInvoiceLines(inv.id),
		getVenueById(venue.id),
	]);
	const pdfBuffer = await buildTenancyInvoicePdfBuffer({
		invoice: inv,
		lines,
		tenancy: t,
		venue: venueRow ?? venue,
	});
	await sendTenancyInvoiceEmail({
		tenancy: t,
		invoice: inv,
		contactEmail: t.contact_email,
		contactFirstName: t.contact_first_name,
		pdfBuffer,
	});
	revalidatePath(`/admin/tenancies/${inv.tenancy_id}`);
	return { ok: true };
}

/**
 * List inbound bank transactions that haven't been matched to anything
 * yet, so the Reconcile dialog can show "which bank line paid this
 * invoice?". Caller filters/sorts client-side.
 */
export async function listUnmatchedBankTransactionsAction() {
	const venue = await gate();
	return listUnmatchedInboundTransactions(venue.id, { limit: 50 });
}

const ReconcileSchema = z.object({
	invoice_id: z.string().uuid(),
	transaction_id: z.string().uuid(),
});

/**
 * Link a bank transaction to an invoice, flip the invoice to paid, and
 * record the transaction's settled date as the paid_at. Refuses if the
 * transaction is already linked to something else.
 */
export async function reconcileTenancyInvoiceAction(input) {
	const venue = await gate();
	const parsed = ReconcileSchema.parse(input);
	const inv = await getInvoiceById(parsed.invoice_id, { venueId: venue.id });
	if (!inv) throw new Error("Invoice not found.");
	if (inv.status === "void") {
		throw new Error("Voided invoices cannot be reconciled.");
	}
	await setBankTransactionMatch(parsed.transaction_id, {
		matchedToId: parsed.invoice_id,
		matchedToType: "tenancy_invoice",
	});
	const t = await getTenancyById(inv.tenancy_id, { venueId: venue.id });
	const tx = await getBankTransactionMatchedTo(parsed.invoice_id, "tenancy_invoice");
	const paidAt = tx?.transaction_time || tx?.settled_at || new Date();
	await updateInvoice(parsed.invoice_id, {
		status: "paid",
		paid_at: paidAt,
	});
	revalidatePath(`/admin/tenancies/${inv.tenancy_id}`);
	if (t?.organisation_id) revalidatePath(`/admin/crm/${t.organisation_id}`);
	return { ok: true };
}

/**
 * Reverse a reconciliation: clear the bank link AND drop the invoice
 * back to "issued". Used when the admin clicks "undo" on a reconciled
 * row.
 */
export async function unreconcileTenancyInvoiceAction(invoiceId) {
	const venue = await gate();
	const inv = await getInvoiceById(invoiceId, { venueId: venue.id });
	if (!inv) throw new Error("Invoice not found.");
	const tx = await getBankTransactionMatchedTo(invoice_id_safe(inv.id), "tenancy_invoice");
	if (tx) {
		await clearBankTransactionMatch(tx.id);
	}
	await updateInvoice(invoice_id_safe(inv.id), {
		status: "issued",
		paid_at: null,
	});
	revalidatePath(`/admin/tenancies/${inv.tenancy_id}`);
	const t = await getTenancyById(inv.tenancy_id, { venueId: venue.id });
	if (t?.organisation_id) revalidatePath(`/admin/crm/${t.organisation_id}`);
	return { ok: true };
}

function invoice_id_safe(id) {
	if (!id) throw new Error("Invoice id required.");
	return id;
}
