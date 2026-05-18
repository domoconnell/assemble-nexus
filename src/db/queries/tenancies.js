import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
	tenancy,
	tenancy_session,
	tenancy_invoice,
} from "@/db/schema/entities/tenancy.js";
import { customer } from "@/db/schema/entities/customer.js";
import { room } from "@/db/schema/entities/room.js";

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
			per_session_rate_cents: tenancy.per_session_rate_cents,
			schedule_rule: tenancy.schedule_rule,
			notes: tenancy.notes,
			customer_id: tenancy.customer_id,
			customer_first_name: customer.first_name,
			customer_last_name: customer.last_name,
			customer_email: customer.email,
			room_id: tenancy.room_id,
			room_name: room.name,
			room_is_public: room.is_public,
		})
		.from(tenancy)
		.innerJoin(customer, eq(customer.id, tenancy.customer_id))
		.innerJoin(room, eq(room.id, tenancy.room_id))
		.where(and(...conditions))
		.orderBy(asc(tenancy.status), desc(tenancy.starts_on));
}

export async function getTenancyById(id, { venueId } = {}) {
	const conditions = [eq(tenancy.id, id), isNull(tenancy.deletedAt)];
	if (venueId) conditions.push(eq(tenancy.venue_id, venueId));
	const [row] = await db
		.select({
			tenancy: tenancy,
			customer_first_name: customer.first_name,
			customer_last_name: customer.last_name,
			customer_email: customer.email,
			customer_phone: customer.phone,
			room_name: room.name,
			room_is_public: room.is_public,
		})
		.from(tenancy)
		.innerJoin(customer, eq(customer.id, tenancy.customer_id))
		.innerJoin(room, eq(room.id, tenancy.room_id))
		.where(and(...conditions))
		.limit(1);
	if (!row) return null;
	return { ...row.tenancy, ...row, tenancy: undefined };
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
 */
export async function listActiveScheduledTenancies(venueId) {
	const conditions = [
		eq(tenancy.kind, "scheduled_recurring"),
		eq(tenancy.status, "active"),
		isNull(tenancy.deletedAt),
	];
	if (venueId) conditions.push(eq(tenancy.venue_id, venueId));
	return db.select().from(tenancy).where(and(...conditions));
}

export async function listActivePrivateRentals(venueId) {
	const conditions = [
		eq(tenancy.kind, "private_rental"),
		eq(tenancy.status, "active"),
		isNull(tenancy.deletedAt),
	];
	if (venueId) conditions.push(eq(tenancy.venue_id, venueId));
	return db.select().from(tenancy).where(and(...conditions));
}
