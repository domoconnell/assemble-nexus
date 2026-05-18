/**
 * Registry of every transactional email the system can send.
 *
 * Each entry documents:
 *   - templateId:  the SendGrid Dynamic Template ID (starts with `d-…`). Leave
 *                  null until you've created the template in SendGrid. When
 *                  null, sendTemplate() throws "not configured" and the
 *                  call-site's safeSend wrapper logs without breaking the
 *                  user-facing flow.
 *   - description: what the email is and when it fires
 *   - audience:    who receives it (staff | hirer | delegate | any)
 *   - fields:      the dynamic-template-data fields the code passes; the
 *                  SendGrid template must reference these. Keep this in sync
 *                  with the call-site senders so template authors know exactly
 *                  what's available.
 *
 * Template IDs live in this file and nowhere else. Never put them in env vars
 * or duplicate them across the codebase - change them here.
 */

export const EMAIL_TEMPLATES = {
	"magic-link": {
		templateId: "d-42b885662ffe4362832b440b4575f184",
		description: "Passwordless sign-in link sent to staff or hirers when they request to log in.",
		audience: "any",
		fields: {
			venue_name: "Public venue name (e.g. 'The Assembly Rooms Newark').",
			magic_link: "Full URL the user clicks to sign in.",
			first_name: "Recipient's first name (empty for accounts without one).",
			last_name: "Recipient's last name (empty for accounts without one).",
		},
	},

	"auth-otp": {
		templateId: "d-a0f5c5d0d93144d9bbe70d71bf63f3a2",
		description: "Six-digit one-time code sent during booking and ticket checkout. Mobile-friendly alternative to the magic link - the code is entered back in the original tab so the session lands in the right browser. 10-minute expiry.",
		audience: "any",
		fields: {
			venue_name: "Public venue name.",
			code: "Six-digit numeric code (string).",
			expires_in_minutes: "How long the code is valid (number).",
			first_name: "Recipient's first name. Empty string for new users.",
			last_name: "Recipient's last name. Empty string for new users.",
		},
	},

	"booking-enquiry-received": {
		templateId: "d-cbc78969db0a415c96297c423b5e16fb",
		description: "Sent to the hirer immediately after they submit a booking enquiry.",
		audience: "hirer",
		fields: {
			venue_name: "Public venue name (e.g. 'The Assembly Rooms').",
			first_name: "Hirer's first name.",
			reference: "Human-readable booking reference (e.g. 'BK-2026-0042').",
			total: "GBP-formatted total (e.g. '£500.00').",
			view_url: "Public link to the customer-facing booking status page.",
		},
	},

	"booking-staff-notification": {
		templateId: "d-82c748ef5236448e957804f9476ca182",
		description: "Sent to all staff/admin users when a new booking enquiry is submitted.",
		audience: "staff",
		fields: {
			venue_name: "Public venue name.",
			reference: "Booking reference.",
			customer_name: "Combined first + last name.",
			customer_email: "Hirer's email address.",
			customer_phone: "Hirer's phone (may be empty).",
			customer_organisation: "Hirer's organisation (may be empty).",
			total: "GBP-formatted total.",
			review_url: "Internal admin link: /admin/bookings/[id].",
			room_name: "Comma-separated room name(s) across the booking's segments.",
			starts_at: "First segment start - formatted London time (e.g. 'Sat 14 Jun 2026, 09:00').",
			ends_at: "Last segment end - formatted London time.",
			date_range: "Pre-formatted span. Same-day collapses to 'Sat 14 Jun 2026, 09:00 – 17:00'; multi-day shows both dates.",
			is_ticketed: "Boolean - true if the booking enabled ticketing. Use with {{#if is_ticketed}} … {{/if}}.",
			ticketing_label: "Human string: 'Yes' or 'No'. Use when you just want a plain label cell.",
			segment_count: "Number of segments in the booking (>=1; >1 for recurring/multi-day).",
			segments: "Array of segments for {{#each segments}} iteration. Each item has: room_name, booking_type, starts_at, ends_at, range, subtotal.",
		},
	},

	"booking-approved": {
		templateId: "d-fa287c2caf64478ba885f9d6289cff7d",
		description: "Sent to the hirer when an admin approves their pending booking. When the booking had ticketing enabled, a draft event is auto-created and ticketing_setup_url points the hirer at the designer.",
		audience: "hirer",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Hirer's first name.",
			reference: "Booking reference.",
			total: "GBP-formatted total.",
			deposit_required: "GBP-formatted deposit amount.",
			note: "Optional note from staff (may be empty).",
			view_url: "Public link to the booking status page.",
			pay_deposit_url: "When a deposit is required: link to /booking/[reference]/pay. Empty when no deposit.",
			has_deposit: "Boolean - true when pay_deposit_url is present. Use to conditionally show the 'Pay deposit' CTA.",
			ticketing_setup_url: "When the booking had ticketing enabled: link to /my-events/[id]/edit so the hirer can design their ticketing page. Empty when ticketing was not enabled.",
			has_ticketing_setup: "Boolean - true when ticketing_setup_url is present. Use to conditionally show the 'set up tickets' CTA in the template.",
		},
	},

	"booking-balance-invoice": {
		templateId: "d-12dfaa28bd9e4846a53fb189e0ce51e1",
		description: "Sent to the hirer when an admin issues the balance invoice. Includes the amount due and a link to pay.",
		audience: "hirer",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Hirer's first name.",
			reference: "Booking reference.",
			balance_due: "GBP-formatted balance amount due.",
			total: "GBP-formatted booking total.",
			deposit_paid: "GBP-formatted deposit already paid.",
			pay_url: "Link to /booking/[reference]/pay-balance.",
			view_url: "Link to the public booking status page.",
		},
	},

	"booking-balance-paid": {
		templateId: "d-770ec0c446c240938e88dfa11d8d738a",
		description: "Sent to the hirer when the balance is fully paid and the booking flips to completed.",
		audience: "hirer",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Hirer's first name.",
			reference: "Booking reference.",
			total: "GBP-formatted booking total.",
			view_url: "Link to the public booking status page.",
		},
	},

	"booking-deposit-paid": {
		templateId: "d-c9fc4fabbfba4a2893af9b116bf98d17",
		description: "Sent to the hirer after their deposit payment succeeds and the booking flips to confirmed.",
		audience: "hirer",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Hirer's first name.",
			reference: "Booking reference.",
			deposit_paid: "GBP-formatted deposit amount paid.",
			total: "GBP-formatted total cost of the booking.",
			balance_due: "GBP-formatted remaining balance.",
			view_url: "Public link to the booking status page.",
		},
	},

	"tenancy-welcome": {
		templateId: null,
		description: "Dual-purpose welcome email. Sent when the admin clicks 'Send welcome email' on a tenancy that has a draft agreement, no signed agreement, and no active DD. Single link covers review + sign + DD setup - the sign page chains the tenant on to DD afterwards.",
		audience: "delegate",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Tenant contact's first name (may be empty).",
			organisation_name: "Tenant organisation name.",
			room_name: "Room being rented.",
			agreement_url: "Public link to /tenancy/agreement/[token].",
		},
	},

	"tenancy-agreement-send": {
		templateId: null,
		description: "Sent when an admin sends a specific agreement (e.g. a re-issued draft after cancellation). Contains the link to review + sign; if DD is still needed the sign page chains on to it.",
		audience: "delegate",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Tenant contact's first name (may be empty).",
			organisation_name: "Tenant organisation name.",
			room_name: "Room being rented.",
			agreement_url: "Public link to /tenancy/agreement/[token].",
		},
	},

	"tenancy-agreement-signed": {
		templateId: null,
		description: "Sent to a tenant after they sign an agreement digitally. Conditionally points to direct debit setup if the tenancy still needs DD.",
		audience: "delegate",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Tenant contact's first name.",
			organisation_name: "Tenant organisation name.",
			signed_at: "Pre-formatted timestamp of the signature.",
			direct_debit_url: "Link to /tenancy/[dd_token]/direct-debit when DD setup still needed, empty otherwise.",
			needs_direct_debit: "Boolean - true when direct_debit_url is present. Use with {{#if needs_direct_debit}} to show the DD CTA.",
		},
	},

	"tenancy-agreement-cancelled": {
		templateId: null,
		description: "Sent to a tenant when an admin cancels an outstanding agreement (e.g. terms changed, paperwork superseded). Lets them know not to act on the previous link.",
		audience: "delegate",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Tenant contact's first name.",
			organisation_name: "Tenant organisation name.",
			cancelled_reason: "Short reason the admin entered (may be empty).",
		},
	},

	"tenancy-dd-setup": {
		templateId: null,
		description: "Stand-alone direct-debit setup nudge. Used when an admin wants to send just the DD link (e.g. agreement already signed in person, or DD mandate needs replacing without re-issuing the agreement).",
		audience: "delegate",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Tenant contact's first name.",
			organisation_name: "Tenant organisation name.",
			direct_debit_url: "Link to /tenancy/[dd_token]/direct-debit.",
		},
	},

	"tenancy-dd-ready": {
		templateId: null,
		description: "Sent to a tenant once their direct debit mandate is in place. Confirms the venue will pull funds on each invoice date.",
		audience: "delegate",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Tenant contact's first name.",
			organisation_name: "Tenant organisation name.",
			invoice_day_of_month: "Day of month each invoice is collected (e.g. '1st').",
		},
	},

	"booking-reminder": {
		templateId: null,
		description: "Sent by the daily cron at fixed offsets before a booking's first segment (currently 7 days and 1 day out). Skipped if already fired for that offset.",
		audience: "hirer",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Hirer's first name.",
			reference: "Booking reference.",
			event_starts_at: "Pre-formatted London-time start of the first segment.",
			room_name: "Room name (or comma-list for multi-room bookings).",
			days_until: "Integer days until the booking (e.g. 7 or 1).",
			balance_due: "GBP-formatted balance still owed, '£0.00' when fully paid.",
			has_balance: "Boolean - true when balance_due > 0.",
			view_url: "Public link to the booking status page.",
			pay_url: "Link to /booking/[reference]/pay-balance when balance owed, empty otherwise.",
		},
	},

	"booking-rejected": {
		templateId: "d-f471def9290c4559974f82c64af03fc1",
		description: "Sent to the hirer when an admin declines their pending booking.",
		audience: "hirer",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Hirer's first name.",
			reference: "Booking reference.",
			reason: "Reason for the decline (required by the rejection action).",
			view_url: "Public link to the booking status page.",
		},
	},

	"ticket-delivery": {
		templateId: "d-2eddfe82946043219b3af5c4cd6d8ee4",
		description: "Single delivery email sent to the buyer when a ticket order is finalised. Attaches a multi-page PDF of every ticket, includes the order summary inline, and links to the public gallery page where each ticket exposes its Apple Wallet + Google Wallet add buttons.",
		audience: "delegate",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Ticket holder's first name. Defaults to 'there' if unknown.",
			event_title: "Title of the event.",
			reference: "Order reference (e.g. 'TX-2026-0042').",
			total: "GBP-formatted total paid (e.g. '£45.00').",
			tickets_count: "Number of tickets in the order (integer).",
			tickets_url: "Public no-auth gallery (/tickets/[order-id]) where each ticket has its Add-to-Wallet buttons.",
		},
	},

	"monthly-board-pack": {
		templateId: "d-55561b6b1e074f8c9c15d035de38bf4d",
		description: "Sent on the 1st of every month to the configured board-report recipients. Attaches the previous month's board pack PDF.",
		audience: "staff",
		fields: {
			venue_name: "Public venue name.",
			month_label: "Human-readable label (e.g. 'May 2026').",
			ym: "Machine identifier (e.g. '2026-05').",
			recipient_name: "Recipient's display name when set, otherwise empty.",
			download_url: "Public S3 link to the PDF for re-download.",
		},
	},

};

export function listEmailTemplateKeys() {
	return Object.keys(EMAIL_TEMPLATES);
}

export function getEmailTemplate(key) {
	const entry = EMAIL_TEMPLATES[key];
	if (!entry) throw new Error(`Unknown email template key: ${key}`);
	return entry;
}

export function resolveEmailTemplateId(key) {
	const entry = getEmailTemplate(key);
	if (!entry.templateId) throw new Error(`No SendGrid template configured for "${key}". Set EMAIL_TEMPLATES["${key}"].templateId in src/utils/email/templates.js.`);
	return entry.templateId;
}
