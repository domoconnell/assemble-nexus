# Go-live punch list

Deep-dive audit synthesised into a prioritised list. Each item is actionable; check off as we work through tomorrow.

> Filtered from raw audit findings — `.env` is correctly gitignored, ticket redemption is gated by per-event check-in code; those flagged in raw output are non-issues.

---

## Blockers — must do before live

- [ ] **Remove OTP logging.** `src/utils/auth/auth.js:85` logs one-time codes to stdout. One-line removal; leaks secrets to prod log aggregators.
- [ ] **Wire error monitoring.** Sentry / Datadog / etc. Currently flying blind on production exceptions.
- [ ] **Rate-limit auth endpoints.** Magic-link + OTP have no brute-force protection today. Per-email + per-IP throttle.
- [ ] **Apply migrations 0047–0053 to prod DB** before deploying any code that touches the new columns.
- [ ] **Verify all 18 SendGrid templates exist** in your SendGrid account with the `d-…` IDs in `src/utils/email/templates.js`. The 7 most recently wired need their HTML uploaded from `email_templates/`.
- [ ] **Wire prod cron triggers** for `/crons/daily-tasks`, `/crons/bank-sync`, `/crons/monthly-report`, `/crons/square-sync`. Hitting each on a schedule with header `x-cron-secret: $CRON_SECRET`.
- [ ] **Confirm DigitalOcean DB backups + point-in-time recovery** are enabled at the platform level.

## High priority

- [ ] **`getAgreementById` missing soft-delete filter** — `src/db/queries/tenancies.js:241`. Currently returns deleted agreement rows.
- [ ] **Audit soft-delete coverage** in `src/db/queries/events.js`, `finance.js`, `rooms.js`. Multiple queries flagged for missing `isNull(deletedAt)` filters.
- [ ] **`typescript.ignoreBuildErrors: true`** in `next.config.mjs`. Decide: turn off and fix, or accept the risk knowingly.
- [ ] **Staging smoke-test pass** — booking → approve → deposit → balance; tenancy → sign → DD → invoice. End-to-end on staging.
- [ ] **One real Stripe live-mode card transaction** on prod.
- [ ] **One real Bacs DD mandate capture** on prod (org-side flow).
- [ ] **Add a second admin user** to avoid single-admin lockout risk on `dom@assemblechurch.com`.
- [ ] **Card decline retry CTA** on `StripePaymentForm`. Currently no "try a different card" path; declined customers reload to retry.
- [ ] **Success toast on tenancy agreement sign.** Mobile users may double-tap without confirmation.

## Medium

- [ ] **Token expiry + single-use** on `tenancy_agreement.token` and `organisation.dd_token`. Currently permanent if leaked.
- [ ] **Stripe webhook event-id dedup.** Persist `event.id`, skip duplicates. Defense in depth beyond the 5-min replay window.
- [ ] **FK on `tenancy_session.invoice_id`** → `tenancy_invoice`. Currently no FK; orphan risk.
- [ ] **Raise DB pool from `max: 5`** in `src/db/index.js`. Likely too low for prod load; 10–15 is a safer baseline.
- [ ] **Email verification.** Disabled in better-auth today (`requireEmailVerification: false`). Decide: keep off (current design) or enable.
- [ ] **`/api/auth/methods`** leaks email-existence + auth-method info. Tighten or auth-gate.
- [ ] **Audit `next.config.experimental.staleTimes.dynamic: 180s`** — verify it doesn't cause stale data on payment / booking-status pages.
- [ ] **BookingWidget submit confirmation** — add an explicit "we'll be in touch" state with reference number so customers know it landed.

## Tidy-up

- [ ] **Drop legacy `tenancy` columns:** `dd_token`, `stripe_customer_id`, `direct_debit_mandate_id`, `direct_debit_ready_at`, `per_session_rate_cents`. All unused; one migration.
- [ ] **Delete stale `board_report_recipients` setting rows + `RecipientsEditor` component file** — superseded by per-user subscriptions.
- [ ] **Payment-form mobile fix** — `grid-cols-3` on expiry/CVC is cramped on small screens; add `grid-cols-2 sm:grid-cols-3`.
- [ ] **Expand unit-test coverage** — booking finaliser, Stripe webhook handlers, schedule engine, invoicer. Current coverage is 3 test files.
