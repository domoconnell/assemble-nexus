import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
	tenancy,
	tenancy_line,
	tenancy_session,
	tenancy_invoice,
	tenancy_invoice_line,
	tenancy_agreement,
} from "@/db/schema/entities/tenancy.js";
import { room } from "@/db/schema/entities/room.js";
import { organisation } from "@/db/schema/entities/organisation.js";
import { contact } from "@/db/schema/entities/contact.js";

/* ------------------------------------------------------------------ */
/* lines                                                               */
/* ------------------------------------------------------------------ */

/**
 * Every tenancy_line for a tenancy, sorted as the admin arranged them.
 * Joined to `room` so the UI / invoicer can render the room name and
 * check public/private without a second round-trip.
 */
export async function listLinesForTenancy(tenancyId) {
	return db
		.select({
			id: tenancy_line.id,
			tenancy_id: tenancy_line.tenancy_id,
			room_id: tenancy_line.room_id,
			room_name: room.name,
			room_is_public: room.is_public,
			kind: tenancy_line.kind,
			label: tenancy_line.label,
			monthly_rate_cents: tenancy_line.monthly_rate_cents,
			schedule_rule: tenancy_line.schedule_rule,
			billing_mode: tenancy_line.billing_mode,
			per_session_rate_cents: tenancy_line.per_session_rate_cents,
			per_hour_rate_cents: tenancy_line.per_hour_rate_cents,
			fixed_monthly_rate_cents: tenancy_line.fixed_monthly_rate_cents,
			sort_order: tenancy_line.sort_order,
		})
		.from(tenancy_line)
		.innerJoin(room, eq(room.id, tenancy_line.room_id))
		.where(
			and(
				eq(tenancy_line.tenancy_id, tenancyId),
				isNull(tenancy_line.deletedAt),
			),
		)
		.orderBy(asc(tenancy_line.sort_order), asc(tenancy_line.createdAt));
}

export async function insertLines(rows) {
	if (!rows?.length) return [];
	return db.insert(tenancy_line).values(rows).returning();
}

export async function replaceLines(tenancyId, lines) {
	// Hard-delete existing lines for the tenancy, then re-insert. Used by
	// the update action - simpler than diffing and the table is small.
	// FK on tenancy_session.tenancy_line_id is `set null` so future
	// sessions still reference the right line via the new row IDs only
	// when re-materialised; existing sessions become orphan-line.
	await db.delete(tenancy_line).where(eq(tenancy_line.tenancy_id, tenancyId));
	if (!lines?.length) return [];
	return db
		.insert(tenancy_line)
		.values(lines.map((l) => ({ ...l, tenancy_id: tenancyId })))
		.returning();
}

/* ------------------------------------------------------------------ */
/* tenancies                                                           */
/* ------------------------------------------------------------------ */

export async function listTenancies(venueId, { status, includeEnded = false } = {}) {
	const conditions = [eq(tenancy.venue_id, venueId), isNull(tenancy.deletedAt)];
	if (status) conditions.push(eq(tenancy.status, status));
	else if (!includeEnded) conditions.push(inArray(tenancy.status, ["active", "paused"]));
	return db
		.select({
			id: tenancy.id,
			status: tenancy.status,
			label: tenancy.label,
			starts_on: tenancy.starts_on,
			ends_on: tenancy.ends_on,
			invoice_day_of_month: tenancy.invoice_day_of_month,
			monthly_override_cents: tenancy.monthly_override_cents,
			notes: tenancy.notes,
			organisation_id: tenancy.organisation_id,
			organisation_name: organisation.name,
			contact_id: tenancy.contact_id,
			contact_first_name: contact.first_name,
			contact_last_name: contact.last_name,
			contact_email: contact.email,
			org_direct_debit_ready_at: organisation.direct_debit_ready_at,
			line_count: sql`(
				SELECT COUNT(*)::int FROM tenancy_line
				WHERE tenancy_id = ${tenancy.id} AND deleted_at IS NULL
			)`.as("line_count"),
			// Sum the predictable per-month components of this tenancy:
			// occupancy lines (always monthly) + scheduled lines on
			// fixed_monthly billing. Per-session / per-hour lines vary
			// month-to-month so they don't contribute to a headline figure.
			fixed_monthly_cents: sql`(
				SELECT COALESCE(SUM(
					COALESCE(monthly_rate_cents, 0)
					+ CASE WHEN billing_mode = 'fixed_monthly'
						THEN COALESCE(fixed_monthly_rate_cents, 0)
						ELSE 0 END
				), 0)::int
				FROM tenancy_line
				WHERE tenancy_id = ${tenancy.id} AND deleted_at IS NULL
			)`.as("fixed_monthly_cents"),
			// True if any line bills per-session or per-hour, i.e. the
			// monthly total will vary.
			has_variable_lines: sql`EXISTS (
				SELECT 1 FROM tenancy_line
				WHERE tenancy_id = ${tenancy.id} AND deleted_at IS NULL
					AND kind = 'scheduled'
					AND billing_mode IN ('per_session', 'per_hour')
			)`.as("has_variable_lines"),
			agreement_signed_at: sql`(
				SELECT MAX(signed_at) FROM tenancy_agreement
				WHERE tenancy_id = ${tenancy.id}
					AND status = 'signed'
					AND deleted_at IS NULL
			)`.as("agreement_signed_at"),
		})
		.from(tenancy)
		.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
		.leftJoin(
			contact,
			eq(contact.id, sql`COALESCE(${tenancy.contact_id}, ${organisation.primary_contact_id})`),
		)
		.where(and(...conditions))
		.orderBy(asc(tenancy.status), desc(tenancy.starts_on));
}

/**
 * Tenancies belonging to a given organisation. Used by the CRM org page
 * to render the Tenancies tab.
 */
export async function listTenanciesForOrganisation(organisationId) {
	return db
		.select({
			id: tenancy.id,
			status: tenancy.status,
			label: tenancy.label,
			starts_on: tenancy.starts_on,
			ends_on: tenancy.ends_on,
			monthly_override_cents: tenancy.monthly_override_cents,
			invoice_day_of_month: tenancy.invoice_day_of_month,
			line_count: sql`(
				SELECT COUNT(*)::int FROM tenancy_line
				WHERE tenancy_id = ${tenancy.id} AND deleted_at IS NULL
			)`.as("line_count"),
			latest_signed_pdf_file_id: sql`(
				SELECT pdf_file_id FROM tenancy_agreement
				WHERE tenancy_id = ${tenancy.id}
					AND status = 'signed'
					AND deleted_at IS NULL
					AND pdf_file_id IS NOT NULL
				ORDER BY signed_at DESC NULLS LAST
				LIMIT 1
			)`.as("latest_signed_pdf_file_id"),
		})
		.from(tenancy)
		.where(
			and(
				eq(tenancy.organisation_id, organisationId),
				isNull(tenancy.deletedAt),
			),
		)
		.orderBy(asc(tenancy.status), desc(tenancy.starts_on));
}

/**
 * Tenancy contract + the org/contact context the detail page renders.
 * Lines are fetched separately via `listLinesForTenancy` so the caller
 * can do both in parallel.
 */
export async function getTenancyById(id, { venueId } = {}) {
	const conditions = [eq(tenancy.id, id), isNull(tenancy.deletedAt)];
	if (venueId) conditions.push(eq(tenancy.venue_id, venueId));
	const [row] = await db
		.select({
			tenancy: tenancy,
			organisation_name: organisation.name,
			organisation_address_lines: organisation.address_lines,
			organisation_vat_number: organisation.vat_number,
			// Direct Debit lives on the organisation - surface it here so
			// the tenancy page can show the mandate status without a
			// second round-trip.
			org_dd_token: organisation.dd_token,
			org_stripe_customer_id: organisation.stripe_customer_id,
			org_direct_debit_mandate_id: organisation.direct_debit_mandate_id,
			org_direct_debit_ready_at: organisation.direct_debit_ready_at,
			contact_first_name: contact.first_name,
			contact_last_name: contact.last_name,
			contact_email: contact.email,
			contact_phone: contact.phone,
		})
		.from(tenancy)
		.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
		.leftJoin(
			contact,
			eq(contact.id, sql`COALESCE(${tenancy.contact_id}, ${organisation.primary_contact_id})`),
		)
		.where(and(...conditions))
		.limit(1);
	if (!row) return null;
	return { ...row.tenancy, ...row, tenancy: undefined };
}

/* ---------------- agreements ---------------- */

export async function listAgreementsForTenancy(tenancyId) {
	return db
		.select()
		.from(tenancy_agreement)
		.where(
			and(
				eq(tenancy_agreement.tenancy_id, tenancyId),
				isNull(tenancy_agreement.deletedAt),
			),
		)
		.orderBy(desc(tenancy_agreement.createdAt));
}

export async function getActiveAgreement(tenancyId) {
	const [row] = await db
		.select()
		.from(tenancy_agreement)
		.where(
			and(
				eq(tenancy_agreement.tenancy_id, tenancyId),
				ne(tenancy_agreement.status, "cancelled"),
				isNull(tenancy_agreement.deletedAt),
			),
		)
		.orderBy(desc(tenancy_agreement.createdAt))
		.limit(1);
	return row ?? null;
}

/**
 * Resolve a public-facing token to the full agreement row + parent
 * tenancy context the sign page needs.
 */
export async function getAgreementByToken(token) {
	if (!token) return null;
	const [row] = await db
		.select({
			agreement: tenancy_agreement,
			tenancy: tenancy,
			organisation_name: organisation.name,
			org_dd_token: organisation.dd_token,
			org_direct_debit_ready_at: organisation.direct_debit_ready_at,
			contact_first_name: contact.first_name,
			contact_last_name: contact.last_name,
			contact_email: contact.email,
		})
		.from(tenancy_agreement)
		.innerJoin(tenancy, eq(tenancy.id, tenancy_agreement.tenancy_id))
		.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
		.leftJoin(
			contact,
			eq(contact.id, sql`COALESCE(${tenancy.contact_id}, ${organisation.primary_contact_id})`),
		)
		.where(
			and(
				eq(tenancy_agreement.token, token),
				isNull(tenancy_agreement.deletedAt),
			),
		)
		.limit(1);
	if (!row) return null;
	return {
		agreement: row.agreement,
		tenancy: {
			...row.tenancy,
			organisation_name: row.organisation_name,
			org_dd_token: row.org_dd_token,
			org_direct_debit_ready_at: row.org_direct_debit_ready_at,
			contact_first_name: row.contact_first_name,
			contact_last_name: row.contact_last_name,
			contact_email: row.contact_email,
		},
	};
}

export async function insertAgreement(values) {
	const [row] = await db.insert(tenancy_agreement).values(values).returning();
	return row;
}

export async function updateAgreement(id, patch) {
	const [row] = await db
		.update(tenancy_agreement)
		.set(patch)
		.where(eq(tenancy_agreement.id, id))
		.returning();
	return row;
}

export async function getAgreementById(id) {
	const [row] = await db
		.select()
		.from(tenancy_agreement)
		.where(and(eq(tenancy_agreement.id, id), isNull(tenancy_agreement.deletedAt)))
		.limit(1);
	return row ?? null;
}

export async function insertTenancy(values) {
	const [row] = await db.insert(tenancy).values(values).returning();
	return row;
}

export async function updateTenancy(id, patch) {
	const [row] = await db
		.update(tenancy)
		.set(patch)
		.where(eq(tenancy.id, id))
		.returning();
	return row;
}

export async function softDeleteTenancy(id) {
	await db
		.update(tenancy)
		.set({ deletedAt: new Date(), status: "ended" })
		.where(eq(tenancy.id, id));
}

/* ---------------- sessions ---------------- */

export async function listSessionsForTenancy(tenancyId, { from, to, statuses } = {}) {
	const conditions = [
		eq(tenancy_session.tenancy_id, tenancyId),
		isNull(tenancy_session.deletedAt),
	];
	if (from) conditions.push(gte(tenancy_session.starts_at, from));
	if (to) conditions.push(lt(tenancy_session.starts_at, to));
	if (statuses?.length) conditions.push(inArray(tenancy_session.status, statuses));
	return db
		.select()
		.from(tenancy_session)
		.where(and(...conditions))
		.orderBy(asc(tenancy_session.starts_at));
}

export async function insertSessions(rows) {
	if (!rows || rows.length === 0) return [];
	return db.insert(tenancy_session).values(rows).returning();
}

export async function cancelSession(id, reason) {
	const [row] = await db
		.update(tenancy_session)
		.set({
			status: "cancelled",
			cancelled_at: new Date(),
			cancelled_reason: reason ?? null,
		})
		.where(eq(tenancy_session.id, id))
		.returning();
	return row;
}

export async function uncancelSession(id) {
	const [row] = await db
		.update(tenancy_session)
		.set({
			status: "scheduled",
			cancelled_at: null,
			cancelled_reason: null,
		})
		.where(eq(tenancy_session.id, id))
		.returning();
	return row;
}

/**
 * Sessions overlapping a window across the whole venue. Used by the
 * calendar / availability view so tenancy occurrences block the same
 * slots that booking_segments would. Joined to tenancy_line for the
 * room (now per-line, not per-tenancy).
 */
export async function listSessionsInRange(venueId, fromDate, toDate) {
	return db
		.select({
			id: tenancy_session.id,
			tenancy_id: tenancy_session.tenancy_id,
			starts_at: tenancy_session.starts_at,
			ends_at: tenancy_session.ends_at,
			status: tenancy_session.status,
			room_id: tenancy_line.room_id,
			room_name: room.name,
			label: tenancy.label,
			organisation_name: organisation.name,
		})
		.from(tenancy_session)
		.innerJoin(tenancy, eq(tenancy.id, tenancy_session.tenancy_id))
		.innerJoin(tenancy_line, eq(tenancy_line.id, tenancy_session.tenancy_line_id))
		.innerJoin(room, eq(room.id, tenancy_line.room_id))
		.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
		.where(
			and(
				eq(tenancy.venue_id, venueId),
				isNull(tenancy_session.deletedAt),
				eq(tenancy_session.status, "scheduled"),
				gte(tenancy_session.starts_at, fromDate),
				lt(tenancy_session.starts_at, toDate),
			),
		)
		.orderBy(asc(tenancy_session.starts_at));
}

/* ---------------- invoices ---------------- */

export async function sumTenancyRentalForMonth(
	venueId,
	monthStartDate,
	monthEndDate,
	periodYm,
) {
	const endIso = monthEndDate.toISOString();
	const [issuedRow] = await db
		.select({
			total: sql`coalesce(sum(${tenancy_invoice.subtotal_cents}), 0)::int`,
		})
		.from(tenancy_invoice)
		.where(
			and(
				eq(tenancy_invoice.venue_id, venueId),
				eq(tenancy_invoice.period_ym, periodYm),
				ne(tenancy_invoice.status, "void"),
				isNull(tenancy_invoice.deletedAt),
			),
		);
	const [paidRow] = await db
		.select({
			total: sql`coalesce(sum(${tenancy_invoice.subtotal_cents}), 0)::int`,
		})
		.from(tenancy_invoice)
		.where(
			and(
				eq(tenancy_invoice.venue_id, venueId),
				eq(tenancy_invoice.status, "paid"),
				gte(tenancy_invoice.paid_at, monthStartDate),
				sql`${tenancy_invoice.paid_at} < ${endIso}`,
				isNull(tenancy_invoice.deletedAt),
			),
		);
	return {
		issued: Number(issuedRow?.total ?? 0),
		paid: Number(paidRow?.total ?? 0),
	};
}

/**
 * Tenancy sessions in a time window for the venue, joined to room +
 * tenancy + organisation so the dashboard's Today/This-week widget can
 * render them next to bookings without extra round-trips. Only scheduled
 * (i.e. not cancelled) sessions are returned — occupancy lines don't
 * have sessions at all, so they're naturally excluded.
 */
export async function listTenancySessionsForRange(venueId, start, end) {
	return db
		.select({
			id: tenancy_session.id,
			tenancy_id: tenancy_session.tenancy_id,
			starts_at: tenancy_session.starts_at,
			ends_at: tenancy_session.ends_at,
			room_id: room.id,
			room_name: room.name,
			organisation_name: organisation.name,
			tenancy_label: tenancy.label,
		})
		.from(tenancy_session)
		.innerJoin(tenancy, eq(tenancy_session.tenancy_id, tenancy.id))
		.innerJoin(tenancy_line, eq(tenancy_session.tenancy_line_id, tenancy_line.id))
		.innerJoin(room, eq(tenancy_line.room_id, room.id))
		.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
		.where(
			and(
				eq(tenancy.venue_id, venueId),
				isNull(tenancy.deletedAt),
				isNull(tenancy_session.deletedAt),
				eq(tenancy_session.status, "scheduled"),
				lt(tenancy_session.starts_at, end),
				gt(tenancy_session.ends_at, start),
			),
		)
		.orderBy(asc(tenancy_session.starts_at));
}

export async function listOutstandingTenancyInvoices(venueId) {
	return db
		.select({
			id: tenancy_invoice.id,
			reference: tenancy_invoice.reference,
			period_ym: tenancy_invoice.period_ym,
			status: tenancy_invoice.status,
			total_cents: tenancy_invoice.total_cents,
			subtotal_cents: tenancy_invoice.subtotal_cents,
			issued_at: tenancy_invoice.issued_at,
			tenancy_id: tenancy_invoice.tenancy_id,
			tenancy_label: tenancy.label,
			organisation_name: organisation.name,
		})
		.from(tenancy_invoice)
		.innerJoin(tenancy, eq(tenancy.id, tenancy_invoice.tenancy_id))
		.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
		.where(
			and(
				eq(tenancy_invoice.venue_id, venueId),
				inArray(tenancy_invoice.status, ["draft", "issued"]),
				isNull(tenancy_invoice.deletedAt),
			),
		)
		.orderBy(asc(tenancy_invoice.period_ym), asc(tenancy_invoice.issued_at));
}

/**
 * Every tenancy invoice belonging to an organisation, across all of its
 * tenancies. Used by the CRM organisation Invoices tab. Each row carries
 * its parent tenancy's id + label so the UI can group / link back.
 */
export async function listInvoicesForOrganisation(organisationId) {
	return db
		.select({
			id: tenancy_invoice.id,
			tenancy_id: tenancy_invoice.tenancy_id,
			reference: tenancy_invoice.reference,
			period_ym: tenancy_invoice.period_ym,
			status: tenancy_invoice.status,
			subtotal_cents: tenancy_invoice.subtotal_cents,
			uncapped_subtotal_cents: tenancy_invoice.uncapped_subtotal_cents,
			rack_subtotal_cents: tenancy_invoice.rack_subtotal_cents,
			line_discount_total_cents: tenancy_invoice.line_discount_total_cents,
			total_cents: tenancy_invoice.total_cents,
			issued_at: tenancy_invoice.issued_at,
			paid_at: tenancy_invoice.paid_at,
			stripe_payment_intent_id: tenancy_invoice.stripe_payment_intent_id,
			dd_charge_status: tenancy_invoice.dd_charge_status,
			dd_charged_at: tenancy_invoice.dd_charged_at,
			tenancy_label: tenancy.label,
		})
		.from(tenancy_invoice)
		.innerJoin(tenancy, eq(tenancy.id, tenancy_invoice.tenancy_id))
		.where(
			and(
				eq(tenancy.organisation_id, organisationId),
				isNull(tenancy_invoice.deletedAt),
				isNull(tenancy.deletedAt),
			),
		)
		.orderBy(desc(tenancy_invoice.period_ym), desc(tenancy_invoice.issued_at));
}

export async function listInvoicesForTenancy(tenancyId) {
	return db
		.select()
		.from(tenancy_invoice)
		.where(
			and(
				eq(tenancy_invoice.tenancy_id, tenancyId),
				isNull(tenancy_invoice.deletedAt),
			),
		)
		.orderBy(desc(tenancy_invoice.period_ym));
}

export async function getInvoiceForPeriod(tenancyId, periodYm) {
	const [row] = await db
		.select()
		.from(tenancy_invoice)
		.where(
			and(
				eq(tenancy_invoice.tenancy_id, tenancyId),
				eq(tenancy_invoice.period_ym, periodYm),
				// Voided invoices shouldn't block re-issuing for the same
				// period — the admin explicitly threw the old one away.
				ne(tenancy_invoice.status, "void"),
				isNull(tenancy_invoice.deletedAt),
			),
		)
		.limit(1);
	return row ?? null;
}

/**
 * Detach every session linked to an invoice and put each session back
 * in `scheduled`. Used by void + soft-delete so the work can be
 * re-billed under a fresh invoice without leaving session rows pinned
 * to a defunct invoice.
 */
export async function freeSessionsFromInvoice(invoiceId) {
	await db
		.update(tenancy_session)
		.set({ invoice_id: null, status: "scheduled" })
		.where(eq(tenancy_session.invoice_id, invoiceId));
}

/**
 * Soft-delete a tenancy invoice. Used by the admin "Delete" button to
 * hide an invoice entirely (the row stays for audit but `deletedAt` is
 * set so listings and duplicate-period checks both skip it). Also frees
 * any sessions that were attached so they can be re-billed.
 */
export async function softDeleteInvoice(id) {
	await db
		.update(tenancy_session)
		.set({ invoice_id: null, status: "scheduled" })
		.where(eq(tenancy_session.invoice_id, id));
	const [row] = await db
		.update(tenancy_invoice)
		.set({ deletedAt: new Date() })
		.where(eq(tenancy_invoice.id, id))
		.returning();
	return row;
}

export async function insertInvoice(values) {
	const [row] = await db.insert(tenancy_invoice).values(values).returning();
	return row;
}

export async function getInvoiceById(id, { venueId } = {}) {
	const conds = [eq(tenancy_invoice.id, id), isNull(tenancy_invoice.deletedAt)];
	if (venueId) conds.push(eq(tenancy_invoice.venue_id, venueId));
	const [row] = await db
		.select()
		.from(tenancy_invoice)
		.where(and(...conds))
		.limit(1);
	return row ?? null;
}

export async function updateInvoice(id, patch) {
	const [row] = await db
		.update(tenancy_invoice)
		.set(patch)
		.where(eq(tenancy_invoice.id, id))
		.returning();
	return row;
}

export async function insertInvoiceLines(rows) {
	if (!rows?.length) return [];
	return db.insert(tenancy_invoice_line).values(rows).returning();
}

export async function listInvoiceLines(invoiceId) {
	return db
		.select()
		.from(tenancy_invoice_line)
		.where(eq(tenancy_invoice_line.invoice_id, invoiceId))
		.orderBy(asc(tenancy_invoice_line.sort_order), asc(tenancy_invoice_line.createdAt));
}

/**
 * Attach a batch of sessions to an invoice — i.e. lock them in as "this
 * has been billed". We deliberately do NOT change `status` here: a
 * session's status is its physical state (scheduled → cancelled, or
 * eventually "completed" after the time has passed), separate from
 * whether it's been invoiced. The `invoice_id` column carries the
 * billing link; `status` stays "scheduled" so the calendar and
 * dashboard widget keep showing future sessions even after they've been
 * billed in advance.
 */
export async function attachSessionsToInvoice(sessionIds, invoiceId) {
	if (!sessionIds?.length) return;
	await db
		.update(tenancy_session)
		.set({ invoice_id: invoiceId })
		.where(inArray(tenancy_session.id, sessionIds));
}

/**
 * Active tenancies (with any non-deleted line). Used by the cron's
 * materialiser + invoicer. Caller fetches lines per-tenancy via
 * `listLinesForTenancy`.
 */
export async function listActiveTenancies(venueId) {
	const conditions = [
		eq(tenancy.status, "active"),
		isNull(tenancy.deletedAt),
	];
	if (venueId) conditions.push(eq(tenancy.venue_id, venueId));
	return db
		.select({
			id: tenancy.id,
			venue_id: tenancy.venue_id,
			status: tenancy.status,
			label: tenancy.label,
			organisation_id: tenancy.organisation_id,
			monthly_override_cents: tenancy.monthly_override_cents,
			auto_bill_via_dd: tenancy.auto_bill_via_dd,
			invoice_day_of_month: tenancy.invoice_day_of_month,
			starts_on: tenancy.starts_on,
			ends_on: tenancy.ends_on,
			org_stripe_customer_id: organisation.stripe_customer_id,
			org_direct_debit_mandate_id: organisation.direct_debit_mandate_id,
		})
		.from(tenancy)
		.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
		.where(and(...conditions));
}
