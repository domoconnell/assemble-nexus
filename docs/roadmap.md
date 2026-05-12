# Roadmap

A running list of what's open. Phase docs in `phases/` describe the
shape of completed and in-flight streams; this file is the "what's
next" view.

## In progress

- **Admin dashboard** — `/admin` currently has a welcome + the "Events
  pending approval" widget. Building out the full venue-management
  surface (see "Admin dashboard cards" below).

## Up next (proposed)

### Admin dashboard cards

The home page should answer "what needs attention?" and "how are we
doing?" in one glance. Priority order:

1. **This month's ministry-gift surplus** + income breakdown
   (tickets / bookings / POS / manual) + cost breakdown. Reuses
   `getMonthlyPnl` from `db/queries/finance.js`.
2. **Pending bookings** count + link to inbox. Reuses
   `countPendingBookings`.
3. **Events pending approval** (already built — first card).
4. **Outstanding balances** total — sum of `(total - deposit_paid -
   balance_paid)` across confirmed bookings. Needs new query.
5. **Today's rooms in use** — booking segments + events for today,
   grouped by room. Needs new query.
6. **Next 7 days** — small calendar / list of upcoming bookings &
   events. Needs new query.
7. **Recent activity** — last booking, last ticket order, last event
   submitted. Light feed.

### Untested ground

Recent flows haven't been walked through end-to-end. Worth a real
session before adding more on top:

- Magic-link polling identity flow (new email, existing email,
  multi-org pick)
- Wizard → `/my-events/[id]/setup` stepped flow
- Booking-status gate on submit-for-approval (with the deposit
  payment flow flipping booking → `confirmed`)
- Admin org-picker on event editor (incl. inline "+ Create new")
- Admin direct-booking form's `admin_create` mode
- `(organisers)` portal on mobile

### Polish & harden

- Error states / empty states across the new pages
- Email templates: "organisation added" confirmation? "event
  submitted for approval" notification to admin? "event approved"
  notification to hirer?
- Audit trail UI — `booking_status_event` rows are written but
  never surfaced
- Accessibility / keyboard sweeps (focus traps in the wizard modal,
  dialog dismissal, etc.)
- Mobile pass on the admin app — sidebar collapses, tables
  scrolling, etc.
- Wizard's `magic_link_sent` polling has no max-attempts / timeout
  cap; could end up running forever

### Gaps noticed

- Admin booking detail page (`/admin/bookings/[id]`) doesn't surface
  the linked event the way the hirer's `/my-bookings/[id]` does
- No way to **cancel** an event from the admin editor (status enum has
  `cancelled` but no UI path); only delete
- "Events pending approval" dashboard widget has no dedicated
  "approve & publish" action — admin has to open the event editor
  and flip status manually
- Approval workflow could be a one-click "Approve" on the widget tile
  (with a confirm step) rather than a status dropdown

## Parked (waiting on external accounts)

- **Apple Wallet + Google Wallet** — see [phases/wallets.md](phases/wallets.md).
  Public-facing buttons are placeholder SVGs; real integration needs
  dev-portal accounts and signing keys.
- **Square POS sync** — see [phases/financial-foundation.md](phases/financial-foundation.md#pos-integration--square-parked-until-accounts-exist).
  Code is in place; needs `SQUARE_ACCESS_TOKEN` + `SQUARE_LOCATION_ID`.
  Until then `cost_of_delivery` is only the explicit expense rows, not
  POS COGS.
- **Starling bank balance** — same shape; needs
  `STARLING_ACCESS_TOKEN` + `STARLING_ACCOUNT_UID`.

## Deferred (revisit when needed)

- **Director board pack PDF** — already shipped; defer further work
  on it until directors have actually used the dashboard for a few
  months and we know what additional bundling they want.
- **Reports** (monthly P&L export, trend, per-room utilisation) — same
  reasoning.
- **Fuller wizard expansion** — the wizard's ticketing step currently
  collects ticket types; the bigger "addons / hero / discounts in the
  wizard itself" was solved with Path B (stepped `/setup` page) so
  expansion of the modal is no longer needed.
