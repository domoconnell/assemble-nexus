# Email templates

Body fragments for every SendGrid Dynamic Template used by the platform.
Each `.html` file is the **body content only** — the `<head>`, the Assembly
Rooms logo, and any footer chrome live in the SendGrid template's outer
module, not in these files.

The variable list at the top of every file mirrors the canonical spec in
[`src/utils/email/templates.js`](../src/utils/email/templates.js). When
adding or changing a variable, update both.

## Template index

| File                                | Template key                  | Audience  | Notes                                                       |
| ----------------------------------- | ----------------------------- | --------- | ----------------------------------------------------------- |
| `magic-link.html`                   | `magic-link`                  | any       | Already in SendGrid                                         |
| `auth-otp.html`                     | `auth-otp`                    | any       |                                                             |
| `booking-enquiry-received.html`     | `booking-enquiry-received`    | hirer     |                                                             |
| `booking-staff-notification.html`   | `booking-staff-notification`  | staff     | Pre-iterated `{{#each segments}}`                           |
| `booking-approved.html`             | `booking-approved`            | hirer     | Conditional deposit + ticketing CTAs                        |
| `booking-deposit-paid.html`         | `booking-deposit-paid`        | hirer     |                                                             |
| `booking-balance-invoice.html`      | `booking-balance-invoice`     | hirer     |                                                             |
| `booking-balance-paid.html`         | `booking-balance-paid`        | hirer     |                                                             |
| `booking-rejected.html`             | `booking-rejected`            | hirer     |                                                             |
| `booking-payment-link.html`         | `booking-payment-link`        | hirer     | Admin clicks "Send link" on a payment row                   |
| `booking-payment-invoice.html`      | `booking-payment-invoice`     | hirer     | PDF attached · per-payment OR full-booking invoice          |
| `ticket-delivery.html`              | `ticket-delivery`             | delegate  | Already in SendGrid · PDF attached · order summary inline   |
| `monthly-board-pack.html`           | `monthly-board-pack`          | staff     | Already in SendGrid · PDF attached                          |
| `tenancy-agreement-send.html`       | `tenancy-agreement-send`      | delegate  | Sent when admin clicks "Send agreement" on a tenancy        |
| `tenancy-invoice.html`              | `tenancy-invoice`             | delegate  | Sent when admin clicks "Send" on a tenancy invoice · PDF attached |
| `tenancy-agreement-signed.html`     | `tenancy-agreement-signed`    | delegate  | Confirmation after tenant signs digitally                   |
| `tenancy-dd-ready.html`             | `tenancy-dd-ready`            | delegate  | Confirmation after Direct Debit mandate is active           |

## Style

Every template uses the same visual language so the suite reads as one
brand:

- Wrapper table: `max-width: 600px`, centered
- Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`
- Body text: 14px / line-height 1.5 / `#0f172a`
- Section labels: 11px uppercase, letter-spacing 2px, `#64748b`
- Borders: `#e2e8f0`
- Primary CTA: teal `#0f766e` background, white text, rounded
- Tabular content uses key/value rows with the label muted (`#64748b`)
  and the value default
