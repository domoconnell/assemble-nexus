# Go-live punch list

Synthesised from the deep-dive audit. ✅ = done in this session.

---

## Blockers — must do before live

- [x] ✅ **OTP logging removed** — `src/utils/auth/auth.js`.
- [ ] **Wire error monitoring** (Sentry / Bugsnag / etc). Decide on a service; both are roughly an afternoon's wiring. **Needs your call on which.**
- [x] ✅ **Auth rate limiting** — `betterAuth.rateLimit` enabled with global 60s/30 and per-endpoint tighter caps on `/sign-in/magic-link`, `/email-otp/send-verification-otp`, `/magic-link/verify`, `/sign-in/email`.
- [ ] **Apply migrations 0047–0056 to prod DB** before code deploy. _(Owned by you — deploy pipeline)._
- [ ] **Verify 7 SendGrid templates exist** with the `d-…` IDs in `src/utils/email/templates.js`. HTML in `email_templates/`. _(Owned by you — SendGrid account)._
- [ ] **Wire prod cron triggers** for `/crons/daily-tasks`, `/crons/bank-sync`, `/crons/monthly-report`, `/crons/square-sync`. _(Owned by you — DO Functions / Heroku Scheduler)._
- [ ] **Confirm DO DB backups + PITR** at the platform level. _(Owned by you — DO console)._

## High priority

- [x] ✅ **`getAgreementById` soft-delete filter added.**
- [x] ✅ **Soft-delete audit** — fixed `userCanEditEvent` in events.js and `sumBookingIncomeForMonth` in finance.js. rooms.js clean.
- [ ] **`typescript.ignoreBuildErrors`** still `true` in `next.config.mjs`. Flipping it likely surfaces tens-to-hundreds of type errors given the codebase is .js-with-types. **Needs your call** on whether to bite that off pre-launch.
- [ ] **Staging smoke-test pass** — booking → approve → deposit → balance; tenancy → sign → DD → invoice. _(Owned by you — staging deploy + manual run)._
- [ ] **One real Stripe live-mode card transaction** on prod. _(Owned by you)._
- [ ] **One real Bacs DD mandate** on prod. _(Owned by you)._
- [ ] **Second admin user** via `/admin/users` → Add admin. _(Owned by you)._
- [x] ✅ **Card decline retry CTA** — error block on payment form now spells out the retry path.
- [x] ✅ **Success toast on tenancy agreement sign.**

## Medium

- [x] ✅ **Agreement token expiry** — `tenancy_agreement.expires_at` set to sent+30d. Public page + sign action reject expired tokens with a friendly "ask for a fresh link" message. `dd_token` deferred — needs a design call (stable link for tenants vs leak risk).
- [x] ✅ **Stripe webhook event-id dedup** — new `webhook_event` table; the handler inserts on entry, returns early if conflicted.
- [x] ✅ **FK `tenancy_session.invoice_id` → `tenancy_invoice`** added (set null on invoice delete).
- [x] ✅ **DB connection pool** raised from 5 → 12 (env-tunable via `POSTGRES_POOL_MAX`).
- [ ] **Email verification** — better-auth `requireEmailVerification: false` today. **Needs your call** — default-on is safer but adds a step to first-login.
- [x] ✅ **Tighten `/api/auth/methods`** — per-IP in-memory rate limit (60s/10) prevents bulk enumeration. Returns 429 over the threshold.
- [x] ✅ **`staleTimes.dynamic` lowered** 180s → 30s. Fixes stale "awaiting payment" UI after Stripe webhook fires.
- [x] ✅ **Booking pending-state callout** — `/my-bookings/[id]` shows an amber "Thanks - we'll be in touch" banner with the booking reference when status is `pending`.

## Tidy-up

- [x] ✅ **Dropped `tenancy.per_session_rate_cents`** (legacy DD columns already dropped in 0049).
- [x] ✅ **Deleted `board_report_recipients` setting + `RecipientsEditor`** + the actions that touched them. Migration ran (1 row removed).
- [x] ✅ **Payment-form mobile grid** — `grid-cols-2 sm:grid-cols-3` on expiry/CVC.
- [ ] **Expand unit-test coverage** — deferred. Scope-heavy; suggest tackling per-feature as you add tests for the items in this list.

## Migrations created this session

- 0054 — `tenancy_session.invoice_id` FK + drop `tenancy.per_session_rate_cents`
- 0055 — `webhook_event` table
- 0056 — `tenancy_agreement.expires_at`

Plus everything 0047–0053 from prior sessions that still need to land on prod.
