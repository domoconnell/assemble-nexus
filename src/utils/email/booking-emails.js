import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { sendTemplate } from "./email.service.js";
import { isSubscribed } from "./subscriptions.js";
import { db } from "@/db/index.js";
import { user } from "@/db/schema/entities/user.js";
import { user_role } from "@/db/schema/entities/user_role.js";
import { role } from "@/db/schema/entities/role.js";
import { booking_segment } from "@/db/schema/entities/booking_segment.js";
import { room } from "@/db/schema/entities/room.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";
import { getVenueById, getCurrentVenue } from "@/db/queries/venue.js";

async function venueNameFor(venueId) {
	const v = venueId ? await getVenueById(venueId) : await getCurrentVenue();
	return v?.name ?? "";
}

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	timeZone: "Europe/London",
});

function fmtDateTime(d) {
	if (!d) return "";
	return dateTimeFmt.format(new Date(d));
}

function fmtRange(start, end) {
	if (!start) return "";
	const s = new Date(start);
	if (!end) return dateTimeFmt.format(s);
	const e = new Date(end);
	return dayKeyFmt.format(s) === dayKeyFmt.format(e)
		? `${dateTimeFmt.format(s)} - ${timeFmt.format(e)}`
		: `${dateTimeFmt.format(s)} - ${dateTimeFmt.format(e)}`;
}

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
	// Staff users with role admin/staff. We pull email_subscriptions
	// alongside so we can drop anyone who's explicitly opted out without
	// a second round-trip.
	const rows = await db
		.selectDistinct({
			email: user.email,
			email_subscriptions: user.email_subscriptions,
		})
		.from(user)
		.innerJoin(user_role, eq(user_role.user_id, user.id))
		.innerJoin(role, eq(role.id, user_role.role_id))
		.where(
			and(
				inArray(role.key, STAFF_ROLE_KEYS),
				isNull(user.deletedAt),
			),
		);
	const recipients = rows
		.filter((r) => isSubscribed(r, "booking-staff-notification"))
		.map((r) => r.email)
		.filter(Boolean);

	const fallback = process.env.BOOKINGS_NOTIFICATION_EMAIL;
	if (recipients.length === 0 && fallback) {
		return [fallback];
	}
	return recipients;
}

export async function sendEnquiryReceivedEmail({ booking, customer }) {
	const venue_name = await venueNameFor(booking.venue_id);
	await safeSend("booking-enquiry-received", customer.email, {
		venue_name,
		first_name: customer.first_name,
		reference: booking.reference,
		total: gbp(booking.total_cents),
		view_url: bookingPublicUrl(booking.reference),
	});
}

export async function sendStaffNotificationEmail({ booking, customer }) {
	const recipients = await listStaffNotificationRecipients();
	if (recipients.length === 0) return;

	const segments = await db
		.select({
			id: booking_segment.id,
			starts_at: booking_segment.starts_at,
			ends_at: booking_segment.ends_at,
			subtotal_cents: booking_segment.computed_subtotal_cents,
			room_name: room.name,
			booking_type_label: booking_type.label,
		})
		.from(booking_segment)
		.innerJoin(room, eq(room.id, booking_segment.room_id))
		.innerJoin(booking_type, eq(booking_type.id, booking_segment.booking_type_id))
		.where(
			and(
				eq(booking_segment.booking_id, booking.id),
				isNull(booking_segment.deletedAt),
			),
		)
		.orderBy(asc(booking_segment.starts_at));

	const firstStart = segments[0]?.starts_at ?? null;
	const lastEnd = segments[segments.length - 1]?.ends_at ?? null;
	const roomNames = [...new Set(segments.map((s) => s.room_name))];
	const isTicketed = !!booking.ticketing_enabled;

	const venue_name = await venueNameFor(booking.venue_id);
	const data = {
		venue_name,
		reference: booking.reference,
		customer_name: `${customer.first_name} ${customer.last_name}`.trim(),
		customer_email: customer.email,
		customer_phone: customer.phone ?? "",
		customer_organisation: customer.organisation ?? "",
		total: gbp(booking.total_cents),
		review_url: bookingAdminUrl(booking.id),
		room_name: roomNames.join(", "),
		starts_at: fmtDateTime(firstStart),
		ends_at: fmtDateTime(lastEnd),
		date_range: fmtRange(firstStart, lastEnd),
		is_ticketed: isTicketed,
		ticketing_label: isTicketed ? "Yes" : "No",
		segment_count: segments.length,
		segments: segments.map((s) => ({
			room_name: s.room_name,
			booking_type: s.booking_type_label,
			starts_at: fmtDateTime(s.starts_at),
			ends_at: fmtDateTime(s.ends_at),
			range: fmtRange(s.starts_at, s.ends_at),
			subtotal: gbp(s.subtotal_cents),
		})),
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
	const venue_name = await venueNameFor(booking.venue_id);
	await safeSend("booking-approved", customer.email, {
		venue_name,
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
	const venue_name = await venueNameFor(booking.venue_id);
	await safeSend("booking-deposit-paid", customer.email, {
		venue_name,
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
	const venue_name = await venueNameFor(booking.venue_id);
	await safeSend("booking-balance-invoice", customer.email, {
		venue_name,
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
	const venue_name = await venueNameFor(booking.venue_id);
	await safeSend("booking-balance-paid", customer.email, {
		venue_name,
		first_name: customer.first_name,
		reference: booking.reference,
		total: gbp(booking.total_cents ?? 0),
		view_url: bookingPublicUrl(booking.reference),
	});
}

export async function sendBookingRejectedEmail({ booking, customer, reason }) {
	const venue_name = await venueNameFor(booking.venue_id);
	await safeSend("booking-rejected", customer.email, {
		venue_name,
		first_name: customer.first_name,
		reference: booking.reference,
		reason: reason ?? "",
		view_url: bookingPublicUrl(booking.reference),
	});
}

export async function sendBookingReminderEmail({
	booking,
	customer,
	daysUntil,
	eventStartsAt,
	roomName,
}) {
	const venue_name = await venueNameFor(booking.venue_id);
	const balanceDue = Math.max(
		0,
		(booking.total_cents ?? 0) - (booking.deposit_paid_cents ?? 0) - (booking.balance_paid_cents ?? 0),
	);
	await safeSend("booking-reminder", customer.email, {
		venue_name,
		first_name: customer.first_name,
		reference: booking.reference,
		event_starts_at: eventStartsAt ?? "",
		room_name: roomName ?? "",
		days_until: daysUntil,
		balance_due: gbp(balanceDue),
		has_balance: balanceDue > 0,
		view_url: bookingPublicUrl(booking.reference),
		pay_url: balanceDue > 0 ? `${baseUrl()}/booking/${booking.reference}/pay-balance` : "",
	});
}
