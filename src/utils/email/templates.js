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
 * or duplicate them across the codebase — change them here.
 */

export const EMAIL_TEMPLATES = {
	"magic-link": {
		templateId: "d-42b885662ffe4362832b440b4575f184",
		description: "Passwordless sign-in link sent to staff or hirers when they request to log in.",
		audience: "any",
		fields: {
			magic_link: "Full URL the user clicks to sign in.",
			expires_in_minutes: "How long the link is valid (number).",
		},
	},

	"booking-enquiry-received": {
		templateId: null,
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
		templateId: null,
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
		},
	},

	"booking-approved": {
		templateId: null,
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
			has_deposit: "Boolean — true when pay_deposit_url is present. Use to conditionally show the 'Pay deposit' CTA.",
			ticketing_setup_url: "When the booking had ticketing enabled: link to /my-events/[id]/edit so the hirer can design their ticketing page. Empty when ticketing was not enabled.",
			has_ticketing_setup: "Boolean — true when ticketing_setup_url is present. Use to conditionally show the 'set up tickets' CTA in the template.",
		},
	},

	"booking-balance-invoice": {
		templateId: null,
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
		templateId: null,
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
		templateId: null,
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

	"booking-rejected": {
		templateId: null,
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

	"apple-wallet-ticket": {
		templateId: "d-2eddfe82946043219b3af5c4cd6d8ee4",
		description: "Delivers a signed .pkpass to the ticket holder so they can tap-to-add to Apple Wallet on their iPhone. Pass file is sent as an attachment.",
		audience: "delegate",
		fields: {
			firstName: "Ticket holder's first name.",
			eventName: "Title of the event.",
		},
	},

	"ticket-order-confirmation": {
		templateId: null,
		description: "Sent to a delegate after they successfully pay for a ticket order. Includes the order reference and a link to view tickets.",
		audience: "delegate",
		fields: {
			venue_name: "Public venue name.",
			first_name: "Buyer's first name.",
			event_title: "Title of the event.",
			reference: "Order reference (e.g. 'TX-2026-0042').",
			total: "GBP-formatted total paid.",
			tickets_count: "Number of tickets in the order.",
			view_url: "Public link to the order detail page (/my-orders/[reference]).",
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
