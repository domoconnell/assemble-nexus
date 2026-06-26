import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { organisation } from "@/db/schema/entities/organisation.js";
import { contact } from "@/db/schema/entities/contact.js";
import { organisation_contact } from "@/db/schema/entities/organisation_contact.js";
import { booking } from "@/db/schema/entities/booking.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { event } from "@/db/schema/entities/event.js";
import { expense } from "@/db/schema/entities/expense.js";
import { tenancy, tenancy_invoice } from "@/db/schema/entities/tenancy.js";

/* ------------------------------------------------------------------------ */
/* organisations                                                            */
/* ------------------------------------------------------------------------ */

export async function listOrganisations(venueId) {
	return db
		.select()
		.from(organisation)
		.where(and(eq(organisation.venue_id, venueId), isNull(organisation.deletedAt)))
		.orderBy(asc(organisation.name));
}

export async function getOrganisationById(id) {
	const [row] = await db
		.select()
		.from(organisation)
		.where(and(eq(organisation.id, id), isNull(organisation.deletedAt)))
		.limit(1);
	return row ?? null;
}

/**
 * Same as `getOrganisationByDdToken` but keyed on the org's id. Used by
 * the CRM "send DD setup email" / "remove mandate" actions so they have
 * the org row + primary contact email/name in one round-trip.
 */
export async function getOrganisationWithContact(id) {
	if (!id) return null;
	const [row] = await db
		.select({
			organisation: organisation,
			contact_email: contact.email,
			contact_first_name: contact.first_name,
			contact_last_name: contact.last_name,
		})
		.from(organisation)
		.leftJoin(contact, eq(contact.id, organisation.primary_contact_id))
		.where(and(eq(organisation.id, id), isNull(organisation.deletedAt)))
		.limit(1);
	if (!row) return null;
	return {
		...row.organisation,
		contact_email: row.contact_email ?? null,
		contact_first_name: row.contact_first_name ?? null,
		contact_last_name: row.contact_last_name ?? null,
	};
}

/**
 * Resolve an organisation by its public Direct Debit token. The
 * no-auth setup pages live at /tenancy/[token]/direct-debit and use
 * this to look the customer up without a session.
 *
 * Also pulls the primary contact's email + first name so the DD-ready
 * email knows where to send the confirmation.
 */
export async function getOrganisationByDdToken(token) {
	if (!token) return null;
	const [row] = await db
		.select({
			organisation: organisation,
			contact_email: contact.email,
			contact_first_name: contact.first_name,
			contact_last_name: contact.last_name,
		})
		.from(organisation)
		.leftJoin(contact, eq(contact.id, organisation.primary_contact_id))
		.where(
			and(
				eq(organisation.dd_token, token),
				isNull(organisation.deletedAt),
			),
		)
		.limit(1);
	if (!row) return null;
	return {
		...row.organisation,
		contact_email: row.contact_email ?? null,
		contact_first_name: row.contact_first_name ?? null,
		contact_last_name: row.contact_last_name ?? null,
	};
}

export async function updateOrganisationDd(id, patch) {
	await db.update(organisation).set(patch).where(eq(organisation.id, id));
}

/* ------------------------------------------------------------------------ */
/* contacts on an organisation                                              */
/* ------------------------------------------------------------------------ */

export async function listContactsForOrganisation(organisationId) {
	return db
		.select({
			id: contact.id,
			first_name: contact.first_name,
			last_name: contact.last_name,
			email: contact.email,
			phone: contact.phone,
			notes: contact.notes,
			role: organisation_contact.role,
			role_notes: organisation_contact.notes,
		})
		.from(organisation_contact)
		.innerJoin(contact, eq(contact.id, organisation_contact.contact_id))
		.where(
			and(
				eq(organisation_contact.organisation_id, organisationId),
				isNull(contact.deletedAt),
			),
		)
		.orderBy(asc(contact.first_name));
}

/* ------------------------------------------------------------------------ */
/* roll-ups: what they owe us, what we owe them                             */
/* ------------------------------------------------------------------------ */

/**
 * For each organisation in the venue, sum:
 *   they_owe_us - outstanding hire balances on bookings linked to the org
 *   we_owe_them - events organised by the org, gross ticket revenue MINUS
 *                 commission, booking fees, and any expenses paid to the org.
 *                 Approximation in v1 - refunds aren't subtracted; that
 *                 comes when the payout flow is built.
 */
export async function listOrganisationsWithBalances(venueId) {
	const orgs = await listOrganisations(venueId);
	if (orgs.length === 0) return [];
	const ids = orgs.map((o) => o.id);

	// they_owe_us - booking outstanding (total - deposit_paid - balance_paid)
	// for any non-cancelled, non-rejected booking linked to the org.
	const bookingOutstanding = await db
		.select({
			org_id: booking.organisation_id,
			amount: sql`coalesce(sum(
				greatest(0, ${booking.total_cents}
					- coalesce(${booking.deposit_paid_cents}, 0)
					- coalesce(${booking.balance_paid_cents}, 0))
			), 0)::bigint`,
		})
		.from(booking)
		.where(
			and(
				inArray(booking.organisation_id, ids),
				isNull(booking.deletedAt),
				sql`${booking.status} not in ('rejected', 'cancelled')`,
			),
		)
		.groupBy(booking.organisation_id);

	// they_owe_us also includes any unpaid tenancy invoice. We sum
	// `total_cents` for issued (non-paid, non-void, non-deleted) invoices
	// across every tenancy the org owns.
	const tenancyInvoiceOutstanding = await db
		.select({
			org_id: tenancy.organisation_id,
			amount: sql`coalesce(sum(${tenancy_invoice.total_cents}), 0)::bigint`,
		})
		.from(tenancy_invoice)
		.innerJoin(tenancy, eq(tenancy.id, tenancy_invoice.tenancy_id))
		.where(
			and(
				inArray(tenancy.organisation_id, ids),
				isNull(tenancy.deletedAt),
				isNull(tenancy_invoice.deletedAt),
				eq(tenancy_invoice.status, "issued"),
			),
		)
		.groupBy(tenancy.organisation_id);

	// we_owe_them - sum of ticket revenue for events organised by the org,
	// minus commission and platform fees that the venue keeps.
	const ticketsForOrgEvents = await db
		.select({
			org_id: event.organiser_organisation_id,
			gross: sql`coalesce(sum(${ticket_order.total_cents}), 0)::bigint`,
			commission: sql`coalesce(sum(${ticket_order.commission_cents}), 0)::bigint`,
			fees: sql`coalesce(sum(${ticket_order.booking_fee_cents}) filter (where ${ticket_order.booking_fee_borne_by} = 'organiser'), 0)::bigint`,
		})
		.from(ticket_order)
		.innerJoin(event, eq(event.id, ticket_order.event_id))
		.where(
			and(
				inArray(event.organiser_organisation_id, ids),
				isNull(ticket_order.deletedAt),
				sql`${ticket_order.status} in ('paid', 'partially_refunded')`,
			),
		)
		.groupBy(event.organiser_organisation_id);

	// Expenses paid TO an organisation reduce we_owe_them (counts as payout).
	// Refund rows on those expenses flip the sign so a refund from the org
	// puts the money the other way again.
	const expensesPaid = await db
		.select({
			org_id: expense.organisation_id,
			amount: sql`coalesce(sum(case when ${expense.kind} = 'refund' then -${expense.amount_cents} else ${expense.amount_cents} end), 0)::bigint`,
		})
		.from(expense)
		.where(
			and(
				inArray(expense.organisation_id, ids),
				isNull(expense.deletedAt),
			),
		)
		.groupBy(expense.organisation_id);

	const owedToVenue = new Map(bookingOutstanding.map((r) => [r.org_id, Number(r.amount)]));
	for (const r of tenancyInvoiceOutstanding) {
		owedToVenue.set(r.org_id, (owedToVenue.get(r.org_id) ?? 0) + Number(r.amount));
	}
	const ticketRollup = new Map(
		ticketsForOrgEvents.map((r) => [
			r.org_id,
			{
				gross: Number(r.gross),
				commission: Number(r.commission),
				fees: Number(r.fees),
			},
		]),
	);
	const expensesByOrg = new Map(expensesPaid.map((r) => [r.org_id, Number(r.amount)]));

	return orgs.map((org) => {
		const tickets = ticketRollup.get(org.id) ?? { gross: 0, commission: 0, fees: 0 };
		const weOweRaw = tickets.gross - tickets.commission - tickets.fees - (expensesByOrg.get(org.id) ?? 0);
		return {
			...org,
			they_owe_us_cents: owedToVenue.get(org.id) ?? 0,
			we_owe_them_cents: Math.max(0, weOweRaw),
		};
	});
}

/* ------------------------------------------------------------------------ */
/* per-org activity                                                          */
/* ------------------------------------------------------------------------ */

export async function listBookingsForOrganisation(organisationId) {
	return db
		.select({
			id: booking.id,
			reference: booking.reference,
			status: booking.status,
			total_cents: booking.total_cents,
			deposit_paid_cents: booking.deposit_paid_cents,
			balance_paid_cents: booking.balance_paid_cents,
			submitted_at: booking.submitted_at,
		})
		.from(booking)
		.where(and(eq(booking.organisation_id, organisationId), isNull(booking.deletedAt)))
		.orderBy(desc(booking.submitted_at));
}

export async function listEventsForOrganisation(organisationId) {
	return db
		.select({
			id: event.id,
			title: event.title,
			starts_at: event.starts_at,
			status: event.status,
		})
		.from(event)
		.where(
			and(
				eq(event.organiser_organisation_id, organisationId),
				isNull(event.deletedAt),
			),
		)
		.orderBy(desc(event.starts_at));
}

export async function listTicketOrdersForOrganisation(organisationId) {
	return db
		.select({
			id: ticket_order.id,
			reference: ticket_order.reference,
			status: ticket_order.status,
			total_cents: ticket_order.total_cents,
			paid_at: ticket_order.paid_at,
			event_id: ticket_order.event_id,
		})
		.from(ticket_order)
		.where(
			and(
				eq(ticket_order.organisation_id, organisationId),
				isNull(ticket_order.deletedAt),
			),
		)
		.orderBy(desc(ticket_order.paid_at));
}

export async function listExpensesForOrganisation(organisationId) {
	return db
		.select({
			id: expense.id,
			date: expense.date,
			description: expense.description,
			amount_cents: expense.amount_cents,
		})
		.from(expense)
		.where(
			and(
				eq(expense.organisation_id, organisationId),
				isNull(expense.deletedAt),
			),
		)
		.orderBy(desc(expense.date));
}
