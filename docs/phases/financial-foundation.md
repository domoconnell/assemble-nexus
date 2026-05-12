# Phase 6 — Financial Foundation

The point of Nexus. Bookings/events generate revenue; this phase turns
the data into director-facing answers:

- How much is the venue making?
- How much is it costing to run?
- What's the surplus available to gift to the church for ministry?

## The ministry-gift formula

Per calendar month:

```
ministry_gift = total_income
              - cost_of_delivery        // calculated from expenses + POS COGS
              - cost_of_utilities       // monthly fixed, schedule-driven
              - cost_of_staff           // monthly fixed, schedule-driven
              - cost_of_mortgage        // monthly fixed, schedule-driven
              - extra_mortgage_payments // monthly fixed, schedule-driven
```

All four "monthly fixed" costs follow the same shape: a value that holds
indefinitely until edited, and edits apply "from this month forwards" — so we
store dated rows in a schedule table and look up the most-recent
`effective_from ≤ target_month` at query time.

## Data model

### New entities

**`recurring_cost_schedule`** — fixed monthly costs that change at known dates
```
- id
- type: enum("utilities" | "staff" | "mortgage" | "mortgage_extra")
- effective_from: date (the 1st of the month it starts applying)
- monthly_amount_cents: integer
- notes: text
- venue_id, created_at, updated_at
```
Lookup: "amount in effect for month M" = `SELECT monthly_amount_cents WHERE
type=? AND effective_from <= date_trunc('month', M) ORDER BY effective_from
DESC LIMIT 1`. Returns 0 if no row.

**`expense_category`** — taxonomy for variable expenses
Seeded: Supplies, Cleaning, Marketing, Maintenance, Software, Event consumables,
Casual staff, Equipment, Other. Custom additions allowed. All count as "cost of
delivery" for the ministry formula in v1; we can flag categories out of the
formula later if needed (e.g. capex).

**`expense`** — variable / one-off operational costs
```
- id
- date: date
- expense_category_id: fk
- description: text
- amount_cents: integer
- supplier_name: text (free text v1 — no separate supplier table yet)
- attachment_file_id: fk → file (receipt scan)
- linked_event_id: fk → event (optional — for per-event profitability)
- linked_booking_id: fk → booking (optional — for per-booking profitability)
- notes: text
- venue_id, created_at, updated_at, deleted_at
```

**`pos_daily_takings`** — one row per day per venue, populated by API sync
```
- id
- date: date
- gross_cents, net_cents, vat_cents, cogs_cents
- transactions_count: integer
- category_breakdown: jsonb (optional: { food: cents, drink: cents, ... })
- source: enum("square_api")  // future: "sumup_api" etc.
- external_ref: text (Square location/day reference)
- synced_at: timestamp (last successful pull)
- venue_id, created_at, updated_at
- unique(venue_id, date)
```
No manual entry, no CSV. Days populate when the Square sync job runs.

**`manual_income`** — donations / ad-hoc income outside bookings/POS
```
- id
- date: date
- kind: enum("donation" | "equipment_hire" | "other")
- description: text
- amount_cents: integer
- notes: text
- attachment_file_id: fk → file (optional)
- venue_id, created_at, updated_at, deleted_at
```

### Income aggregation (derived, not stored)

A view or query helper that returns per-month totals:

- **Booking income** — sum of `booking.total_cents` (or amount actually
  collected via psp_intent) for bookings where the deposit/balance was paid in
  the target month. Refunds subtracted.
- **Ticket income** — sum of `ticket_order.total_cents` for orders paid in
  month, minus refunds. For external-organiser events we have commission +
  booking-fee in the schema already, but for v1 keep it simple: treat the full
  ticket revenue as venue income, and record any payout-to-organiser as an
  `expense` row.
- **POS net** — sum of `pos_daily_takings.net_cents` in month
- **Manual income** — sum of `manual_income.amount_cents` in month

Total income = sum of the four.

### Cost-of-delivery aggregation

- Sum of `expense.amount_cents` in month
- Plus sum of `pos_daily_takings.cogs_cents` in month

(Could later refine to allocate utility/staff costs per event for per-event
profit, but the headline P&L treats utility/staff/mortgage as fixed and
everything else as delivery.)

## Admin UI

New section in the admin sidebar: **Finance**. Lives at `/admin/finance`.

### Pages

**`/admin/finance`** — monthly dashboard
- Month picker (current month default; navigate backwards/forwards)
- The ministry-gift breakdown card: big number + the formula laid out line-by-line
- Income cards: bookings, tickets, POS, donations/other (each click-through to source)
- Cost cards: utilities, staff, mortgage, extra mortgage, cost of delivery (with sub-breakdown by category)
- "Compared to last month" deltas

**`/admin/finance/recurring`** — manage monthly fixed costs
- One section per type (Utilities / Staff / Mortgage / Extra mortgage)
- Each shows current amount in effect + history table
- "Update from <month>" form: pick a future month + new amount → adds a row to `recurring_cost_schedule`

**`/admin/finance/expenses`** — list + add ad-hoc expenses
- Filters: month, category, linked-event, linked-booking
- Add expense modal: date, category, amount, description, supplier, receipt upload, optional link to event/booking
- Inline edit, soft delete

**`/admin/finance/pos`** — POS takings (Square)
- Calendar view of the month with each day's net total + COGS
- Click a day → drilldown: line-level breakdown from the synced Square data
- "Resync this day" button — re-pulls from the Square API (idempotent upsert)
- Top of page: connection status badge + "Resync last 30 days" admin tool

**`/admin/finance/income`** — manual income (donations etc.)
- Simple table + add modal

**`/admin/finance/reports`** — report exports
- Monthly P&L
- 3 / 6 / 12 month trend
- Per-event profitability table (clickable rows → event)
- Per-room utilisation revenue
- "Director board pack" PDF — single download bundling the above for a chosen month/quarter

## POS integration — Square (parked until accounts exist)

**Status**: deferred. Square Business account hasn't been set up yet. The
schema, API client, sync endpoint, and "Sync this month" button are all
wired and waiting — they activate the moment `SQUARE_ACCESS_TOKEN` +
`SQUARE_LOCATION_ID` land in the env. Until then `/admin/finance/pos`
renders a "not connected" panel.

No manual entry, no CSV imports. The Square REST API populates
`pos_daily_takings` directly.

**Credentials needed from the user**:
- Square Personal Access Token (Sandbox + Production) — generated in the
  Square Developer Dashboard. PAT is simpler than OAuth for a single-tenant
  setup.
- Square **Location ID** for the venue (visible in dashboard → Locations).
- Store both in env / secrets: `SQUARE_ACCESS_TOKEN`,
  `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT` (sandbox|production).

**Sync strategy**:
- A scheduled job (daily, runs at e.g. 03:00) pulls the previous day's data
  for each known venue location. Idempotent — re-running for a date upserts.
- Manual "Resync" button per day on the finance UI for back-filling or
  reconciling.

**Endpoints used**:
- `POST /v2/orders/search` — orders in a date range; sum line totals → gross
  and net.
- `POST /v2/payments` (or query via orders) — gross / net / processing fee /
  refunds. Square already separates fee from gross so net is direct.
- VAT: Square line items carry tax breakdowns → aggregate per day.
- COGS: Square Catalog API exposes per-variation `cost_per_unit_money`
  (if the venue records it in Square). Multiply by quantity sold and sum.
  When the cost isn't set in Square, COGS for that line is 0 and we surface
  a warning on the day's UI so the venue knows to backfill costs in Square.

**Category breakdown**: Square line items reference Catalog categories →
roll up per day into `category_breakdown` jsonb.

**Backfill**: on first connection, sync the trailing 90 days (configurable)
to seed history. After that, daily forward.

The data model stays POS-agnostic — `source` enum can later add `sumup_api`,
`toast_api`, etc. without schema changes.

## Bank balance — Starling (parked until accounts exist)

**Status**: deferred. Starling developer portal now requires creating an
application + OAuth flow rather than a simple Personal Access Token, which
is more work than the value of a "cash on hand" widget justifies right now.
Code is in place ([src/lib/finance/starling.js](../../src/lib/finance/starling.js))
and the dashboard auto-shows the widget once `STARLING_ACCESS_TOKEN` +
`STARLING_ACCOUNT_UID` are set; until then the widget renders nothing.

A small sanity-check on the finance dashboard: "Bank: £X" so directors can
eyeball cash on hand against the calculated P&L. Not full transaction
reconciliation, just the current balance pulled live.

**Credentials needed from the user**:
- Starling Personal Access Token from the Starling Developer Portal
  (scope: `balance:read` only — minimum-privilege).
- Starling **Account UID**.
- Store in env: `STARLING_ACCESS_TOKEN`, `STARLING_ACCOUNT_UID`.

**Endpoints used**:
- `GET /api/v2/accounts/{accountUid}/balance` — returns
  `effectiveBalance`, `clearedBalance`, `pendingTransactions`.

**Strategy**: fetch on-demand when the finance dashboard renders (cached for
5 minutes server-side). Display the cleared balance and a small pending
indicator. No storage in DB — purely a live read.

**Future** (Phase 7+): if Starling categorisation turns out to be useful, we
could mirror selected transactions into `bank_transaction` and reconcile
against `expense` rows. For now, balance only.

## Out of scope for Phase 6

- Bank transaction-level reconciliation (just balance for now)
- Accounting-system integration (explicitly off — keep separate)
- Payroll detail (single line item only — no per-employee tracking yet)
- Per-event profit allocation of fixed costs (just delivery costs)
- Budgeting / variance vs budget (Phase 7)
- Cash-flow forecasting (Phase 7)
- Multi-currency
- Capital expenditure depreciation

## Implementation order

1. **Schema + migrations** — all five new tables + seed expense categories. ✓ done
2. **Recurring-cost schedule page + helper** — `getMonthlyAmount(type, month)`. ✓ done
3. **Expense CRUD page** — table, add modal, edit, soft delete. ✓ done
4. **Manual income page** — simple CRUD. ✓ done
5. **Income aggregator** — query helpers per month for tickets / bookings / POS / manual. ✓ done
6. **Finance dashboard** — the monthly P&L card with ministry-gift breakdown. ✓ done
7. **Per-event profitability view** — uses `linked_event_id` on expenses. ✓ done

### Parked (revisit when needed)

9. **Reports** — board-pack PDF, monthly P&L export. Defer until directors
   have actually used the dashboard for a few months and we know what they
   want to see beyond the on-screen view.
10. **Square API client + daily sync job** — code shipped; activates when env
    vars are set. Account not yet created.
11. **POS takings page** — calendar + resync controls. Code shipped; reads
    from `pos_daily_takings` once Square sync populates it.
12. **Starling balance widget** — code shipped; activates when env vars are
    set. Developer portal flow turned out to be heavier than expected; will
    revisit when there's appetite for a "cash on hand" indicator.
