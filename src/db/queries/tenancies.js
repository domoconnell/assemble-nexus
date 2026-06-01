import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
	tenancy,
	tenancy_session,
	tenancy_invoice,
	tenancy_agreement,
} from "@/db/schema/entities/tenancy.js";
import { room } from "@/db/schema/entities/room.js";
import { organisation } from "@/db/schema/entities/organisation.js";
import { contact } from "@/db/schema/entities/contact.js";

export async function listTenancies(venueId, { status, includeEnded = false } = {}) {
	const conditions = [eq(tenancy.venue_id, venueId), isNull(tenancy.deletedAt)];
	if (status) conditions.push(eq(tenancy.status, status));
	else if (!includeEnded) conditions.push(inArray(tenancy.status, ["active", "paused"]));
	return db
		.select({
			id: tenancy.id,
			kind: tenancy.kind,
			status: tenancy.status,
			label: tenancy.label,
			starts_on: tenancy.starts_on,
			ends_on: tenancy.ends_on,
			invoice_day_of_month: tenancy.invoice_day_of_month,
			monthly_rate_cents: tenancy.monthly_rate_cents,
			monthly_override_cents: tenancy.monthly_override_cents,
			schedule_rule: tenancy.schedule_rule,
			notes: tenancy.notes,
			organisation_id: tenancy.organisation_id,
			organisation_name: organisation.name,
			contact_id: tenancy.contact_id,
			contact_first_name: contact.first_name,
			contact_last_name: contact.last_name,
			contact_email: contact.email,
			room_id: tenancy.room_id,
			room_name: room.name,
			room_is_public: room.is_public,
			org_direct_debit_ready_at: organisation.direct_debit_ready_at,
			// Latest signed agreement signed_at via subquery - lets the list
			// page show a "Signed" badge without loading every agreement row.
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
		.innerJoin(room, eq(room.id, tenancy.room_id))
		.where(and(...conditions))
		.orderBy(asc(tenancy.status), desc(tenancy.starts_on));
}

/**
 * Tenancies belonging to a given organisation. Used by the CRM org page
 * to render the Tenancies tab. (The DD widget reads the mandate state
 * directly off the organisation row.)
 */
export async function listTenanciesForOrganisation(organisationId) {
	return db
		.select({
			id: tenancy.id,
			kind: tenancy.kind,
			status: tenancy.status,
			label: tenancy.label,
			starts_on: tenancy.starts_on,
			ends_on: tenancy.ends_on,
			monthly_rate_cents: tenancy.monthly_rate_cents,
			monthly_override_cents: tenancy.monthly_override_cents,
			schedule_rule: tenancy.schedule_rule,
			invoice_day_of_month: tenancy.invoice_day_of_month,
			room_id: tenancy.room_id,
			room_name: room.name,
			// `file.id` of the most-recent signed agreement's PDF, so the CRM
			// row can offer a direct download without a second round trip.
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
		.innerJoin(room, eq(room.id, tenancy.room_id))
		.where(
			and(
				eq(tenancy.organisation_id, organisationId),
				isNull(tenancy.deletedAt),
			),
		)
		.orderBy(asc(tenancy.status), desc(tenancy.starts_on));
}

export async function getTenancyById(id, { venueId } = {}) {
	const conditions = [eq(tenancy.id, id), isNull(tenancy.deletedAt)];
	if (venueId) conditions.push(eq(tenancy.venue_id, venueId));
	const [row] = await db
		.select({
			tenancy: tenancy,
			organisation_name: organisation.name,
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
			room_name: room.name,
			room_is_public: room.is_public,
		})
		.from(tenancy)
		.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
		.leftJoin(
			contact,
			eq(contact.id, sql`COALESCE(${tenancy.contact_id}, ${organisation.primary_contact_id})`),
		)
		.innerJoin(room, eq(room.id, tenancy.room_id))
		.where(and(...conditions))
		.limit(1);
	if (!row) return null;
	return { ...row.tenancy, ...row, tenancy: undefined };
}

/* ---------------- agreements ---------------- */

/**
 * All non-deleted agreements for a tenancy, newest first. The detail
 * page lists them; the public sign page looks up by token instead.
 */
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

/**
 * The "active" agreement = latest non-cancelled, non-deleted row. Used
 * by display + welcome-email eligibility checks.
 */
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
 * tenancy context the sign page needs (organisation, contact, room).
 * Also surfaces the org's DD token + readiness so the page can chain
 * the tenant to DD setup after signing.
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
			room_name: room.name,
		})
		.from(tenancy_agreement)
		.innerJoin(tenancy, eq(tenancy.id, tenancy_agreement.tenancy_id))
		.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
		.leftJoin(
			contact,
			eq(contact.id, sql`COALESCE(${tenancy.contact_id}, ${organisation.primary_contact_id})`),
		)
		.innerJoin(room, eq(room.id, tenancy.room_id))
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
			room_name: row.room_name,
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
 * slots that booking_segments would.
 */
export async function listSessionsInRange(venueId, fromDate, toDate) {
	return db
		.select({
			id: tenancy_session.id,
			tenancy_id: tenancy_session.tenancy_id,
			starts_at: tenancy_session.starts_at,
			ends_at: tenancy_session.ends_at,
			status: tenancy_session.status,
			room_id: tenancy.room_id,
			room_name: room.name,
			label: tenancy.label,
			customer_first_name: customer.first_name,
			customer_last_name: customer.last_name,
		})
		.from(tenancy_session)
		.innerJoin(tenancy, eq(tenancy.id, tenancy_session.tenancy_id))
		.innerJoin(room, eq(room.id, tenancy.room_id))
		.innerJoin(customer, eq(customer.id, tenancy.customer_id))
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

/**
 * Rental income for a month, sliced two ways:
 *   - `issued`: sum of subtotal_cents on every non-void, non-deleted
 *     invoice whose `period_ym` is that month. Accrual view.
 *   - `paid`:   sum of the same, but constrained to invoices with a
 *     `paid_at` inside [monthStartDate, monthEndDate). Cash view -
 *     matches how the rest of the P&L recognises money in (booking
 *     deposits + balances), so this is what feeds income.total.
 *
 * `ymdFirstOfMonth` is the same 'YYYY-MM' that period_ym uses, and
 * `monthStartDate` / `monthEndDate` are the JS-Date boundaries used
 * against the paid_at timestamptz.
 */
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
 * Outstanding tenancy invoices for a venue - anything still in `draft`
 * or `issued`, never paid or voided. Used by the dashboard + ledger
 * "payments owed" widgets. Joined to tenancy/organisation so the UI can
 * show who owes what without a second round-trip.
 */
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
				isNull(tenancy_invoice.deletedAt),
			),
		)
		.limit(1);
	return row ?? null;
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

export async function attachSessionsToInvoice(sessionIds, invoiceId) {
	if (!sessionIds?.length) return;
	await db
		.update(tenancy_session)
		.set({ invoice_id: invoiceId, status: "completed" })
		.where(inArray(tenancy_session.id, sessionIds));
}

/**
 * Active tenancies that need their sessions topped up. Returns rows that
 * have at least one segment date still inside the materialisation window
 * the cron honours.
 *
 * The invoicer also calls this and needs the parent org's DD mandate to
 * auto-charge new invoices, so the org's mandate fields are joined in
 * under `org_*` keys (same shape as `getTenancyById`).
 */
export async function listActiveScheduledTenancies(venueId) {
	const conditions = [
		eq(tenancy.kind, "scheduled_recurring"),
		eq(tenancy.status, "active"),
		isNull(tenancy.deletedAt),
	];
	if (venueId) conditions.push(eq(tenancy.venue_id, venueId));
	return db
		.select({
			id: tenancy.id,
			venue_id: tenancy.venue_id,
			kind: tenancy.kind,
			status: tenancy.status,
			label: tenancy.label,
			organisation_id: tenancy.organisation_id,
			room_id: tenancy.room_id,
			monthly_rate_cents: tenancy.monthly_rate_cents,
			monthly_override_cents: tenancy.monthly_override_cents,
			invoice_day_of_month: tenancy.invoice_day_of_month,
			schedule_rule: tenancy.schedule_rule,
			starts_on: tenancy.starts_on,
			ends_on: tenancy.ends_on,
			org_stripe_customer_id: organisation.stripe_customer_id,
			org_direct_debit_mandate_id: organisation.direct_debit_mandate_id,
		})
		.from(tenancy)
		.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
		.where(and(...conditions));
}

export async function listActivePrivateRentals(venueId) {
	const conditions = [
		eq(tenancy.kind, "private_rental"),
		eq(tenancy.status, "active"),
		isNull(tenancy.deletedAt),
	];
	if (venueId) conditions.push(eq(tenancy.venue_id, venueId));
	return db
		.select({
			id: tenancy.id,
			venue_id: tenancy.venue_id,
			kind: tenancy.kind,
			status: tenancy.status,
			label: tenancy.label,
			organisation_id: tenancy.organisation_id,
			room_id: tenancy.room_id,
			monthly_rate_cents: tenancy.monthly_rate_cents,
			monthly_override_cents: tenancy.monthly_override_cents,
			invoice_day_of_month: tenancy.invoice_day_of_month,
			schedule_rule: tenancy.schedule_rule,
			starts_on: tenancy.starts_on,
			ends_on: tenancy.ends_on,
			org_stripe_customer_id: organisation.stripe_customer_id,
			org_direct_debit_mandate_id: organisation.direct_debit_mandate_id,
		})
		.from(tenancy)
		.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
		.where(and(...conditions));
}
