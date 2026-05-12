# Phase — Organisations & hirer portal

A stream of work that bolted the CRM `organisation` model into the
day-to-day flows (it was previously a standalone admin tool with nothing
feeding it), restructured the hirer-facing portal into `(organisers)`,
and connected the booking lifecycle to the event lifecycle so a hirer
can run their event end-to-end without admin handholding.

## What it adds

### Public booking wizard — identity & org flow

After the existing room/date/ticketing steps the wizard now asks who the
booking is for. Three sub-flows behind one step:

- **Logged-in hirer** (session detected on mount) — picks one of their
  existing organisations, or adds a new one inline.
- **Existing email, not signed in** — magic link is sent; the wizard
  modal polls `/api/auth/me`-style every ~3s for the session to land
  (link is opened in a different tab from the email), then the same
  org-picker flow.
- **New email** — collects name + phone + new org name + short
  description. No magic link round-trip; the customer + user + org +
  contact + organisation_contact rows are all created on submit.

Magic-link landing page is `/auth-verified` (lives under `(public)` so
the existing `/auth` layout's "redirect signed-in users to /admin" rule
doesn't fire). The polling has no max-attempts cap yet.

After the identity step the wizard asks for a free-text "tell us about
your event" brief, which lands in `booking.customer_notes`.

### Ticketing wizard step

"Set up the event now" / "Skip — set it up later". When "now":

- The wizard captures ticket types (name, price, optional cap) inline.
- On submit the draft event is created **immediately** (booking is still
  `pending` at this point) — see "submission-time event creation" below.
- Hirer is redirected to `/my-events/[id]/setup` to walk through the
  rest (description / hero image / add-ons / discounts) in a stepped
  flow before submitting for approval.

When "later", the wizard just submits and lands the user on
`/my-bookings/[id]`. They can still set the event up via
`/my-events/[id]/edit` whenever — there's a "Manage event →" callout on
the booking detail page.

### `(organisers)` route group

Replaces the old `(my-events)` group. Two parallel surfaces, like the
delegate portal's `/my-tickets` + `/my-orders`:

- `/my-bookings` — list of bookings (any status); shows a ticketing
  badge when applicable.
- `/my-bookings/[id]` — full booking detail with schedule, add-ons,
  notes, totals, deposit-paid / balance-paid / outstanding rows. When
  the booking is ticketed, a "Manage event →" tile links through to the
  event.
- `/my-events` — list of ticketed events the user can edit.
- `/my-events/[id]` — event-day-ish detail page: sold count, delegates,
  revenue, ticket types, recent orders.
- `/my-events/[id]/edit` — full event editor (existing component).
- `/my-events/[id]/setup` — stepped post-wizard setup flow (see below).

Shared chrome: pill-tab nav with "Bookings" / "Events" + an inline user
chip with email and Sign out.

Post-login redirect for hirers goes to `/my-bookings` (was
`/my-events`).

### Submission-time draft event creation

Previously a draft event was only created when an admin approved a
booking. That left ticketed-but-unapproved bookings with nowhere to
manage the event — and pending ticket types were sitting on a jsonb
column with no real ticket_type rows behind them.

Now: a draft event is created **at booking-submission time** whenever
`ticketing_enabled` is true. The shared helper
[`ensureDraftEventForBooking`](../../src/lib/events/draft-event.js) is
idempotent (returns the existing event when one exists) and is called
from both the booking POST and the approval action (the approval call
is now a safety net for legacy bookings).

Pending ticket types from the wizard are inserted directly as
`ticket_type` rows on the new event. The `booking.pending_ticket_types`
jsonb column has been dropped.

### Event submit-for-approval — booking-status gate

The hirer's "Submit for approval" button (in both `/edit` and `/setup`)
is disabled until the booking is `confirmed` (deposit paid) or
`completed`. The server action `submitEventForReviewAction` enforces
the same gate. Events without a booking (admin-created) skip the gate.

### Admin event editor — CRM organisation picker

A new "CRM organisation" picker sits above the existing event_organiser
dropdown. Required (with a `*`) when the event has no linked booking
(booking-linked events inherit the org from the booking). Includes an
inline "+ Create new…" option that opens a dialog and persists via the
existing `saveOrganisationAction` from the CRM module.

The Blues Club event has been backfilled with a stub `organisation`
row.

### Admin direct-booking form — customer & org picker

The admin booking form (mode="admin") now skips the public magic-link
identity sub-flow entirely. Instead the IdentityStep renders a single
form: customer first/last/email/phone + organisation dropdown of all
venue orgs with an inline "+ Create new" option.

The booking API has a new `admin_create` identity mode that's
role-gated server-side (admin / staff only).

### Stepped setup mode in the event editor

`/my-events/[id]/setup` renders the existing EventEditor with a new
`setupMode` prop. Walks the hirer through Page → Tickets → Add-ons →
Discounts → Submit using:

- Step-progress strip at the top
- The same tab content components (no duplicate UI)
- Back / Continue nav at the bottom of each step
- A dedicated "Submit" step at the end with the booking-status gate

The full editor at `/edit` is still the canonical place to refine —
setup mode is a guided one-time pass after first creating the event.

### Admin dashboard — "Events pending approval" widget

First card on the admin home page. Lists events in `pending_review`
linking to `/admin/events/[id]` where the admin flips status to
`Published`. The wider dashboard is still pending — see
[../roadmap.md](../roadmap.md).

## Schema delta

- `booking.organisation_id` (uuid, nullable) — wired up from the wizard
- `event.organiser_organisation_id` (uuid, nullable) — wired up from
  the event editor; required server-side for booking-less events
- `booking.pending_ticket_types` dropped — was a transitional
  jsonb column, no longer needed

## Out of scope (for this stream)

- Auto-publishing the event when admin approves it — hirer still has
  to submit-for-approval and admin still has to publish manually
- Email templates for the new flows (no "org confirmation" mail, no
  "event approved" mail for the new pending_review path)
- Audit trail UI for booking_status_event (rows are written but never
  shown)
