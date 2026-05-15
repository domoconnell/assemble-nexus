# Connecting a Revolut Business account

Revolut Business uses **certificate-based OAuth 2.0** — there's no Personal
Access Token option (unlike Starling). The setup is one-time and involves
generating an RSA key pair, registering the public cert on Revolut, and
exchanging an authorisation code for a refresh token. After that, Nexus
auto-refreshes the access token before every sync.

Steps below assume your Revolut Business account is **fully verified** and
you can access **Settings → APIs** in their dashboard. If it's still in
verification, wait.

---

## 1. Generate an RSA key pair

In your terminal, anywhere — these two files end up uploaded to Revolut
and pasted into Nexus. Don't commit them.

```bash
openssl genrsa -out revolut-private.pem 2048
openssl req -new -x509 -key revolut-private.pem -out revolut-cert.pem -days 1825 -subj "/CN=assembly-rooms"
```

You now have:

- `revolut-private.pem` — **secret**. Goes into Nexus only.
- `revolut-cert.pem` — public certificate. Goes into Revolut Business.

The `-days 1825` is five years. Revolut accepts longer; this is plenty.

---

## 2. Register the certificate on Revolut Business

1. Sign in to https://business.revolut.com.
2. Go to **Settings → APIs** (or "API settings" depending on the layout).
3. Click **Add API certificate**.
4. Paste the contents of `revolut-cert.pem` into the form.
5. Set the **OAuth redirect URI** to:
   ```
   https://www.assembly-rooms.com/admin/settings/bank-accounts
   ```
   This must match what you'll enter in Nexus exactly.
6. Save. Revolut will display a **Client ID** — copy it.

---

## 3. Add the bank account in Nexus

1. Nexus → **Settings → Bank accounts → Add bank account**.
2. Pick **Revolut Business**.
3. Fill in the form:

   | Field | Value |
   |---|---|
   | Label | Free-text, e.g. "Revolut GBP" — appears on the dashboard |
   | Environment | **Production** (use Sandbox only if you've got a sandbox account) |
   | Client ID | From step 2 |
   | JWT issuer | `www.assembly-rooms.com` (hostname only, no protocol) |
   | Redirect URI | `https://www.assembly-rooms.com/admin/settings/bank-accounts` |
   | Private key (PEM) | Paste the entire contents of `revolut-private.pem`, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |

4. Click **Save credentials**. The form unlocks the next step.

---

## 4. Authorise the app

1. In the form, click the link **"the authorise URL"** — this opens
   Revolut's consent screen in a new tab.
2. Sign in (if not already) and approve the app's read access to the
   account.
3. Revolut redirects you back to Nexus with `?code=oa_…` in the URL bar.
   The code is the long string after `code=`.
4. Copy that code (just the value, not the whole URL).
5. Paste it into the **Authorisation code** field in the Nexus form.
6. Click **Exchange for tokens**.

Nexus now has a refresh token (~90 days, auto-rotates on each refresh) and
a short-lived access token (~40 min). From this point on, sync runs
automatically without re-authorising.

---

## 5. Pick the account to link

After exchange, Nexus calls `GET /accounts` and shows a dropdown of the
Revolut accounts on this connection. **One Nexus "bank account" row =
one Revolut account.** If you have separate GBP + EUR sub-accounts on
Revolut and want both in Nexus, add the second one as another bank
account row (repeating steps 3–5 — the credentials are the same).

1. Pick the Revolut account from the dropdown.
2. Click **Link account & finish**.

---

## 6. Initial backfill

Back on the Bank accounts list:

1. Find the newly-linked Revolut row.
2. Click **Backfill** (not "Sync") — this pulls roughly 13 months of
   transactions + synthesises 360 days of end-of-day balance snapshots
   from them so the chart on `/admin/ledger/banking` isn't empty.

The first run takes ~30–60 seconds. Re-running is safe; transactions
upsert by Revolut's `${tx.id}:${leg.leg_id}` so duplicates are
impossible.

---

## What happens nightly

The existing **cron-job.org → `/crons/bank-sync`** hit syncs every active
bank account across every connected provider. The Revolut plugin
auto-refreshes its access token within 2 minutes of expiry. You don't
need to add a new cron job.

---

## Transfer detection

If you connect more than one bank account at the same venue (e.g.
Revolut GBP + Revolut EUR, or Revolut + future Starling), the sync
service marks transactions whose counterparty matches another connected
account as `is_transfer = true`. Those are dimmed in the transactions
table and excluded from the **In · this month** / **Out · this month**
totals — so a £5,000 transfer between your own accounts doesn't look
like £5,000 of income AND £5,000 of expense.

---

## Where to find the stored secrets

- **Private key + access tokens** are stored in the
  `bank_account.credentials` JSONB column for the specific row, encrypted
  at rest by Postgres but otherwise plain JSON. There's no separate
  secrets manager.
- The **public certificate** is registered with Revolut, not stored in
  Nexus.
- The **Client ID** is in `bank_account.credentials.client_id`.

If you ever need to rotate the keypair, generate a new one, upload the
new cert to Revolut, get a new Client ID, then edit the Nexus row and
paste both the new Client ID and the new private key. Re-authorise.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Token exchange failed" after pasting the auth code | Code expired (Revolut codes are valid for ~10 min) or already used. Click the authorise URL again to get a fresh code. |
| "Revolut rejected the token. Re-authorise the account." on sync | Refresh token expired (90 days of inactivity) — repeat steps 4–5 to get a new one. |
| Auth code field rejects what looks like a valid code | Make sure you copied **only** the value after `code=`, not the entire URL. |
| Nothing happens after clicking "the authorise URL" | Pop-up blocker. Right-click the link → open in new tab. |
| Account dropdown empty after authorise | You authorised the app but Revolut returned zero accounts — check the connected Revolut account actually has at least one open sub-account. |
| 401 errors in the runtime logs | Access token expired and refresh failed. Check `last_sync_error` on the bank_account row. |
