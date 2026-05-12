import { and, eq, inArray, isNull } from "drizzle-orm";
import { sendTemplate } from "./email.service.js";
import { db } from "@/db/index.js";
import { user } from "@/db/schema/entities/user.js";
import { user_role } from "@/db/schema/entities/user_role.js";
import { role } from "@/db/schema/entities/role.js";

const VENUE_NAME = "The Assembly Rooms";

const STAFF_ROLE_KEYS = ["admin", "staff"];

function baseUrl() {
	return (process.env.BASE_URL || "").replace(/\/$/, "");
}

function bookingPublicUrl(reference) {
	return `${baseUrl()}/booking/${reference}`;
}

function bookingAdminUrl(id) {
	return `${baseUrl()}/admin/bookings/${id}`;
}

function gbp(c) {
	return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
		(c ?? 0) / 100,
	);
}

async function safeSend(templateKey, to, data) {
	if (!to) return;
	try {
		await sendTemplate(templateKey, to, data);
	} catch (err) {
		console.error(`[email:${templateKey}]`, err?.message || err);
	}
}

async function listStaffNotificationRecipients() {
	const rows = await db
		.selectDistinct({ email: user.email })
		.from(user)
		.innerJoin(user_role, eq(user_role.user_id, user.id))
		.innerJoin(role, eq(role.id, user_role.role_id))
		.where(
			and(
				inArray(role.key, STAFF_ROLE_KEYS),
				isNull(user.deletedAt),
			),
		);
	const recipients = rows.map((r) => r.email).filter(Boolean);

	const fallback = process.env.BOOKINGS_NOTIFICATION_EMAIL;
	if (recipients.length === 0 && fallback) {
		return [fallback];
	}
	return recipients;
}

export async function sendEnquiryReceivedEmail({ booking, customer }) {
	await safeSend("booking-enquiry-received", customer.email, {
		venue_name: VENUE_NAME,
		first_name: customer.first_name,
		reference: booking.reference,
		total: gbp(booking.total_cents),
		view_url: bookingPublicUrl(booking.reference),
	});
}

export async function sendStaffNotificationEmail({ booking, customer }) {
	const recipients = await listStaffNotificationRecipients();
	if (recipients.length === 0) return;
	const data = {
		venue_name: VENUE_NAME,
		reference: booking.reference,
		customer_name: `${customer.first_name} ${customer.last_name}`.trim(),
		customer_email: customer.email,
		customer_phone: customer.phone ?? "",
		customer_organisation: customer.organisation ?? "",
		total: gbp(booking.total_cents),
		review_url: bookingAdminUrl(booking.id),
	};
	await Promise.all(
		recipients.map((to) => safeSend("booking-staff-notification", to, data)),
	);
}

export async function sendBookingApprovedEmail({ booking, customer, note, event = null }) {
	const ticketing_setup_url =
		event?.id ? `${baseUrl()}/my-events/${event.id}/edit` : "";
	const pay_deposit_url =
		(booking.deposit_required_cents ?? 0) > 0
			? `${baseUrl()}/booking/${booking.reference}/pay`
			: "";
	await safeSend("booking-approved", customer.email, {
		venue_name: VENUE_NAME,
		first_name: customer.first_name,
		reference: booking.reference,
		total: gbp(booking.total_cents),
		deposit_required: gbp(booking.deposit_required_cents),
		note: note ?? "",
		view_url: bookingPublicUrl(booking.reference),
		pay_deposit_url,
		has_deposit: !!pay_deposit_url,
		ticketing_setup_url,
		has_ticketing_setup: !!ticketing_setup_url,
	});
}

export async function sendBookingDepositPaidEmail({ booking, customer, depositPaidCents }) {
	const total = booking.total_cents ?? 0;
	const deposit = depositPaidCents ?? booking.deposit_paid_cents ?? 0;
	const balance = Math.max(0, total - deposit);
	await safeSend("booking-deposit-paid", customer.email, {
		venue_name: VENUE_NAME,
		first_name: customer.first_name,
		reference: booking.reference,
		deposit_paid: gbp(deposit),
		total: gbp(total),
		balance_due: gbp(balance),
		view_url: bookingPublicUrl(booking.reference),
	});
}

export async function sendBookingBalanceInvoiceEmail({ booking, customer }) {
	const total = booking.total_cents ?? 0;
	const depositPaid = booking.deposit_paid_cents ?? 0;
	const balanceDue = Math.max(0, total - depositPaid - (booking.balance_paid_cents ?? 0));
	await safeSend("booking-balance-invoice", customer.email, {
		venue_name: VENUE_NAME,
		first_name: customer.first_name,
		reference: booking.reference,
		total: gbp(total),
		deposit_paid: gbp(depositPaid),
		balance_due: gbp(balanceDue),
		pay_url: `${baseUrl()}/booking/${booking.reference}/pay-balance`,
		view_url: bookingPublicUrl(booking.reference),
	});
}

export async function sendBookingBalancePaidEmail({ booking, customer }) {
	await safeSend("booking-balance-paid", customer.email, {
		venue_name: VENUE_NAME,
		first_name: customer.first_name,
		reference: booking.reference,
		total: gbp(booking.total_cents ?? 0),
		view_url: bookingPublicUrl(booking.reference),
	});
}

export async function sendBookingRejectedEmail({ booking, customer, reason }) {
	await safeSend("booking-rejected", customer.email, {
		venue_name: VENUE_NAME,
		first_name: customer.first_name,
		reference: booking.reference,
		reason: reason ?? "",
		view_url: bookingPublicUrl(booking.reference),
	});
}
