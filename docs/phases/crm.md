# Phase — CRM / Accounts ledger

A relationship layer over the existing customers + bookings + events.
Hirers and organisers are entities the venue has ongoing financial
relationships with; we currently treat them as one-off rows with no
roll-up. CRM closes that.

## What it adds

**Entities**
- **Organisation**: legal/identifiable counterparty (church, charity, business,
  individual treated as a "household"). Distinct from `event_organiser`
  (which is event-public-facing branding) and `customer` (a contact record
  on a single booking).
- **Contact**: a person linked to one or more organisations, with their role
  on each (primary booker, finance contact, on-the-day contact). One contact
  can sit on multiple organisations (e.g. a freelance event manager).
- **Balance / activity feed**: for each organisation, the running total of
  what they owe the venue (open booking balances, unpaid invoices) and
  what the venue owes them (organiser net from tickets sold, refunds
  pending, expense reimbursements).

## Questions the system answers

- How much does **St Mary's Church** owe us right now? (open hire balances)
- How much do we owe **Promotor X** for last month's tickets? (organiser net,
  minus commission + fees + refunds)
- Show me every booking + event for **Acme Productions** this year.
- Who's the main booker at this organisation? Last contact date?

## Data model sketch

```
organisation
  id, venue_id, name, kind (church | business | charity | individual)
  notes, primary_contact_id (fk → contact, nullable)
  createdAt, updatedAt, deletedAt

contact
  id, venue_id, first_name, last_name, email, phone
  user_id (fk → user, nullable — set when they sign in)
  createdAt, updatedAt, deletedAt

organisation_contact   -- m2m with role per link
  organisation_id, contact_id
  role (primary_booker | finance | onsite | other)
  notes

-- Existing entities get an OPTIONAL link to an organisation:
booking.organisation_id   (nullable)
ticket_order.organisation_id  (nullable — for B2B/wholesale buys)
event.organiser_organisation_id  (nullable — replaces or supplements event_organiser)
expense.organisation_id   (nullable — for vendor payments tagged to a party)
```

The link is optional everywhere; legacy records without an organisation
still work — the CRM view just lists them under "unassigned".

## Roll-ups

Per organisation, calculated on demand:

```
they_owe_us =
    Σ bookings.outstanding (where status in {approved, confirmed} and not fully paid)
  + Σ ticket_order.balance_due (B2B unpaid orders)

we_owe_them =
    Σ events.organiser_net (where event.organiser_organisation_id = org)
  − Σ expenses paid to them
  − Σ payouts recorded
```

These are derived views; no separate ledger table needed in v1. Later we
might add a `payout` table when the venue starts paying organisers via
the system rather than manually.

## UI

- `/admin/crm` — list of organisations with their net balance.
- `/admin/crm/[id]` — one organisation:
  - Header: name, balance (positive = owes us; negative = we owe them)
  - Tabs: Overview / Bookings / Events / Tickets / Expenses / Contacts
  - Activity feed (chronological)
- `/admin/crm/[id]/contacts` — manage people on the org.

## Out of scope for v1

- Payouts to organisers (record-keeping only; actual transfers stay manual)
- Invoice PDFs (separate phase, ties into director board pack)
- Email/SMS reminders for outstanding balances
- Merging duplicate organisations
- Importing existing customers in bulk

## Where it fits in the roadmap

After:
- Director board pack PDF
- Admin booking creation form

(Both feed CRM data: the booking form lets admin pick existing orgs/contacts,
and the board pack pulls per-org figures.)
