# Wallet Passes (Apple Wallet + Google Wallet)

A later-phase add-on. Tickets already render as on-screen QR codes via the order
detail page (and will be emailed in the SendGrid template), so this is a polish
phase rather than a blocker. Two providers, fully independent — can ship either
or both.

## Goal

Every paid ticket gets:
- "Add to Apple Wallet" button (iOS Safari) → downloads `.pkpass`
- "Add to Google Wallet" button (Android Chrome / web) → opens save-URL

Both wallets show: event title, date/time, venue name + address, ticket type,
buyer name, ticket reference, and a scannable QR code containing the same
ticket code we already use at the door.

## Where the buttons appear

- `/orders/[reference]` — per-ticket buttons (each ticket has its own pass)
- `ticket-order-confirmation` email — buttons in the email body, one set per
  ticket (or just one "View tickets" CTA that takes them to the order page on
  their phone if managing buttons-in-email gets fiddly)

## Apple Wallet

### What we need from the dev portal

1. **Apple Developer Program** membership ($99/yr). Must be a paid team account.
2. Apple Developer Portal → **Certificates, IDs & Profiles** → **Identifiers**
   → **+** → **Pass Type IDs** → create one: `pass.com.assembly-rooms.ticket`,
   description: "Assembly Rooms event ticket".
3. Same page, scroll to that Pass Type ID → **Create Certificate**:
   - Generate a CSR via Keychain Access → Certificate Assistant → Request a
     Certificate From a Certificate Authority → save to disk
   - Upload CSR to dev portal
   - Download the resulting `.cer`
4. Double-click `.cer` to import to Keychain, then in Keychain export the cert
   + private key together as a `.p12` (set a password).
5. From Apple's website, download the **WWDR G4 intermediate certificate**
   (`AppleWWDRCAG4.cer`).

### What gets sent to me

- `.p12` file + password
- Apple **Team ID** (top-right of dev portal, 10-char string)
- The `AppleWWDRCAG4.cer` (or I'll fetch it from Apple's public URL myself)

### Implementation

- Convert `.p12` to PEM cert + PEM key locally; store cert+key+WWDR PEMs in
  secrets (env or secret manager) — encrypt at rest, not in repo.
- Add deps: `passkit-generator` (does signing, manifest hashing, zip
  packaging).
- New endpoint: `GET /api/wallet/apple/[code].pkpass`
  - Look up ticket by `code`; 404 if not paid or refunded.
  - Build pass.json with: passTypeIdentifier, teamIdentifier, serialNumber
    (ticket code), organizationName, description, eventTicket fields, QR
    barcode (message = ticket code, format `PKBarcodeFormatQR`).
  - Include image assets in repo: `icon.png`, `icon@2x.png`, `logo.png`,
    `logo@2x.png`, `strip.png` (optional banner image, e.g. venue exterior).
  - Generate pass via `passkit-generator`, return as
    `application/vnd.apple.pkpass`.
- On `/orders/[reference]`: detect iOS (UA sniff) and show "Add to Apple
  Wallet" button linking to `/api/wallet/apple/<code>.pkpass`. On Android,
  hide it (or show only Google button).

### Notes / gotchas

- `.pkpass` must be served with exact content-type
  `application/vnd.apple.pkpass` and **no** `Content-Disposition: attachment`
  on iOS Safari (it'll fail silently otherwise).
- For local testing, use `localhost` + a real iOS device on the same network —
  add the dev machine's cert to trust if needed, or use ngrok.
- Pass **updates** (e.g. event cancelled, time changed) require a web service
  URL on the pass + push notification flow. Skip in v1; if we need it later,
  expose `/api/wallet/apple/push` + `PUT /v1/passes/[passTypeId]/[serial]`.
- Pass-type-ID strings are global — once registered we can never delete it,
  only revoke its cert.

## Google Wallet

### What we need from the dev portal

1. Google Cloud Console → create a project (or reuse existing).
2. **APIs & Services** → enable **Google Wallet API**.
3. **IAM & Admin** → **Service Accounts** → create `wallet-passes` →
   grant role **Wallet Object Issuer** → create JSON key → download.
4. [Google Wallet Business Console](https://pay.google.com/business/console/)
   → sign in with the workspace account → request an **Issuer account** for
   "Event Tickets". Usually approved instantly for events.
5. Wallet Business Console → **Users** → add the service-account email as
   Admin so it can create classes/objects under your issuer.
6. Note the **Issuer ID** (long number, e.g. `3388000000022???xxx`).

### What gets sent to me

- Service-account JSON key
- Issuer ID

### Implementation

- Store JSON key in secrets (env or secret manager).
- Add deps: `google-auth-library` (for JWT signing), `jsonwebtoken`.
- One-time setup script (`scripts/wallet/google-create-class.js`): creates a
  single `EventTicketClass` per Event (or per Venue if all events share styling).
  Class ID format `<issuerId>.<slug>`. Stored on the event row as
  `google_wallet_class_id`.
- Per-ticket: `EventTicketObject` is created lazily when the user clicks "Add
  to Google Wallet" (or eagerly at order finalisation). Object ID format
  `<issuerId>.<ticket-code>`.
- New endpoint: `GET /api/wallet/google/[code]` returns a redirect to
  `https://pay.google.com/gp/v/save/<jwt>` where the JWT is signed by the
  service account and contains the EventTicketObject inline (or a reference to
  an already-created object). Simplest is the "save URL with object inlined"
  flow — no separate object creation API call needed.
- On `/orders/[reference]`: show "Add to Google Wallet" button (always — works
  on Android, web wallet on desktop).

### Notes / gotchas

- Test in the **Demo issuer** mode first (the issuer account ships in Demo
  state — passes only visible to allowlisted accounts until you request
  Production).
- Apply for Production after testing — usually 1–2 day approval.
- `.well-known/jwks.json` not needed since we sign with the service account
  key, not RS256 with our own keys.
- Updates to a pass push live to all users' wallets automatically — just
  update the object via REST and Google syncs. Useful for cancellations.

## Deferred decisions

- Whether to attach the `.pkpass` directly to the order confirmation email
  (works but increases email size and SendGrid bounces). Probably cleaner to
  link to `/orders/[reference]` and let them tap the button there.
- Whether each ticket in a multi-ticket order gets its own pass per attendee,
  or one pass covering the lot. Per-attendee is the right model for door
  scanning — each pass has its own QR code matching its own ticket row.
- Whether to surface wallet buttons in the my-events organiser view (for
  hirers running their own events). Probably yes — they buy tickets to their
  own events sometimes.

## Order of work when we get here

1. SendGrid `ticket-order-confirmation` template wired (prereq — gives us the
   email surface to put wallet buttons in eventually).
2. Apple Wallet end-to-end (dev portal + endpoint + button + iOS test).
3. Google Wallet end-to-end (cloud portal + endpoint + button + Android test).
4. Email integration of buttons (optional; the order page links work fine).
