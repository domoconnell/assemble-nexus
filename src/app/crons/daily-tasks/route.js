import { and, asc, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/db/index.js";
import { booking } from "@/db/schema/entities/booking.js";
import { booking_segment } from "@/db/schema/entities/booking_segment.js";
import { customer } from "@/db/schema/entities/customer.js";
import { room } from "@/db/schema/entities/room.js";
import { listActiveVenues } from "@/db/queries/venue.js";
import {
	sendBookingBalanceInvoiceEmail,
	sendBookingReminderEmail,
} from "@/utils/email/booking-emails.js";
import { materialiseSessionsThrough } from "@/lib/tenancies/materialiser.js";
import { issueTenancyInvoicesForToday } from "@/lib/tenancies/invoicer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily cron - runs every morning. Four jobs:
 *
 *   1. Top up `tenancy_session` rows so the calendar has the next ~3
 *      months of scheduled-recurring tenancy occurrences materialised.
 *   2. Auto-issue tenancy invoices for any tenancy whose
 *      `invoice_day_of_month` is today.
 *   3. Issue balance invoices for bookings whose last segment has ended
 *      but `balance_invoice_issued_at` is still null.
 *   4. Send booking reminder emails at 7 days and 1 day before the first
 *      segment, tracked per offset in `booking.reminders_sent`.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` or `X-Cron-Secret`.
 */
function authorized(req) {
	const secret = process.env.CRON_SECRET;
	if (!secret) return false;
	const auth = req.headers.get("authorization") || "";
	if (auth === `Bearer ${secret}`) return true;
	if (req.headers.get("x-cron-secret") === secret) return true;
	return false;
}

const REMINDER_OFFSETS_DAYS = [7, 1];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short", day: "numeric", month: "short", year: "numeric",
	hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
});

function fmtLondon(d) {
	return d ? dateTimeFmt.format(new Date(d)) : "";
}

/**
 * Issue balance invoices for bookings whose last segment ended before
 * `now` and which haven't already had an invoice issued. Confirmed-only
 * (not cancelled / rejected / completed).
 */
async function autoBalanceInvoices(venueId) {
	const now = new Date();
	const rows = await db.execute(`
		WITH last_segment AS (
			SELECT s.booking_id, MAX(s.ends_at) AS last_end
			FROM booking_segment s
			WHERE s.deleted_at IS NULL
			GROUP BY s.booking_id
		)
		SELECT
			b.id,
			b.reference,
			b.venue_id,
			b.customer_id,
			b.total_cents,
			b.deposit_paid_cents,
			b.balance_paid_cents,
			ls.last_end
		FROM booking b
		JOIN last_segment ls ON ls.booking_id = b.id
		WHERE b.venue_id = '${venueId}'
			AND b.status IN ('approved', 'confirmed')
			AND b.deleted_at IS NULL
			AND b.balance_invoice_issued_at IS NULL
			AND ls.last_end < NOW()
			AND (COALESCE(b.total_cents, 0) - COALESCE(b.deposit_paid_cents, 0) - COALESCE(b.balance_paid_cents, 0)) > 0
	`);

	const results = [];
	for (const r of rows.rows ?? rows) {
		try {
			const [cust] = await db
				.select()
				.from(customer)
				.where(eq(customer.id, r.customer_id))
				.limit(1);
			if (!cust) {
				results.push({ booking_id: r.id, skipped: "no_customer" });
				continue;
			}
			await db
				.update(booking)
				.set({ balance_invoice_issued_at: now })
				.where(eq(booking.id, r.id));

			await sendBookingBalanceInvoiceEmail({
				booking: {
					...r,
					id: r.id,
					venue_id: r.venue_id,
					reference: r.reference,
					total_cents: Number(r.total_cents) || 0,
					deposit_paid_cents: Number(r.deposit_paid_cents) || 0,
					balance_paid_cents: Number(r.balance_paid_cents) || 0,
				},
				customer: cust,
			});
			results.push({ booking_id: r.id, reference: r.reference, ok: true });
		} catch (err) {
			results.push({ booking_id: r.id, error: err?.message || String(err) });
		}
	}
	return results;
}

/**
 * For each upcoming confirmed booking, send a reminder if today is within
 * one day of a configured offset (T-7 or T-1) and we haven't already sent
 * one for that offset. The `reminders_sent` jsonb on the booking tracks
 * which offsets have fired so we don't double-send.
 */
async function sendReminders(venueId) {
	const now = new Date();
	const horizonEnd = new Date(now.getTime() + Math.max(...REMINDER_OFFSETS_DAYS) * ONE_DAY_MS + ONE_DAY_MS);

	const rows = await db
		.select({
			booking_id: booking.id,
			reference: booking.reference,
			venue_id: booking.venue_id,
			customer_id: booking.customer_id,
			status: booking.status,
			reminders_sent: booking.reminders_sent,
			total_cents: booking.total_cents,
			deposit_paid_cents: booking.deposit_paid_cents,
			balance_paid_cents: booking.balance_paid_cents,
			first_start: booking_segment.starts_at,
			room_id: booking_segment.room_id,
		})
		.from(booking)
		.innerJoin(
			booking_segment,
			and(
				eq(booking_segment.booking_id, booking.id),
				isNull(booking_segment.deletedAt),
			),
		)
		.where(
			and(
				eq(booking.venue_id, venueId),
				eq(booking.status, "confirmed"),
				isNull(booking.deletedAt),
			),
		)
		.orderBy(asc(booking_segment.starts_at));

	// Dedupe to first segment per booking
	const firstByBooking = new Map();
	for (const r of rows) {
		if (!firstByBooking.has(r.booking_id)) firstByBooking.set(r.booking_id, r);
	}

	const results = [];
	for (const r of firstByBooking.values()) {
		try {
			const start = new Date(r.first_start);
			if (start <= now || start > horizonEnd) continue;
			const daysOut = Math.round((start.getTime() - now.getTime()) / ONE_DAY_MS);
			const matchedOffset = REMINDER_OFFSETS_DAYS.find((o) => daysOut === o);
			if (matchedOffset == null) continue;

			const sent = r.reminders_sent || {};
			if (sent[String(matchedOffset)]) continue;

			const [cust] = await db
				.select()
				.from(customer)
				.where(eq(customer.id, r.customer_id))
				.limit(1);
			if (!cust) continue;
			const [rm] = await db
				.select({ name: room.name })
				.from(room)
				.where(eq(room.id, r.room_id))
				.limit(1);

			await sendBookingReminderEmail({
				booking: {
					venue_id: r.venue_id,
					reference: r.reference,
					total_cents: r.total_cents,
					deposit_paid_cents: r.deposit_paid_cents,
					balance_paid_cents: r.balance_paid_cents,
				},
				customer: cust,
				daysUntil: matchedOffset,
				eventStartsAt: fmtLondon(start),
				roomName: rm?.name ?? "",
			});

			await db
				.update(booking)
				.set({
					reminders_sent: { ...sent, [String(matchedOffset)]: new Date().toISOString() },
				})
				.where(eq(booking.id, r.booking_id));

			results.push({
				booking_id: r.booking_id,
				reference: r.reference,
				offset_days: matchedOffset,
				ok: true,
			});
		} catch (err) {
			results.push({ booking_id: r.booking_id, error: err?.message || String(err) });
		}
	}
	return results;
}

async function run() {
	const venues = await listActiveVenues();
	const summary = [];
	const today = new Date();
	const materialiseUntil = new Date(today.getTime() + 365 * ONE_DAY_MS);

	for (const venue of venues) {
		try {
			const [materialise, tenancyInvoices, balanceInvoices, reminders] = await Promise.all([
				materialiseSessionsThrough(venue.id, materialiseUntil),
				issueTenancyInvoicesForToday(venue.id, today),
				autoBalanceInvoices(venue.id),
				sendReminders(venue.id),
			]);
			summary.push({
				venue: venue.slug,
				materialise,
				tenancy_invoices: tenancyInvoices,
				balance_invoices: balanceInvoices,
				reminders,
			});
		} catch (err) {
			summary.push({
				venue: venue.slug,
				error: err?.message || String(err),
			});
		}
	}

	return { ran_at: new Date().toISOString(), summary };
}

export async function GET(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	return Response.json(await run());
}

export async function POST(req) {
	if (!authorized(req)) return new Response("Forbidden", { status: 403 });
	return Response.json(await run());
}
