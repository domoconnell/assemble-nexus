import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { organisation } from "@/db/schema/entities/organisation.js";
import { contact } from "@/db/schema/entities/contact.js";
import { organisation_contact } from "@/db/schema/entities/organisation_contact.js";
import { booking } from "@/db/schema/entities/booking.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { event } from "@/db/schema/entities/event.js";
import { expense } from "@/db/schema/entities/expense.js";

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
	const expensesPaid = await db
		.select({
			org_id: expense.organisation_id,
			amount: sql`coalesce(sum(${expense.amount_cents}), 0)::bigint`,
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
