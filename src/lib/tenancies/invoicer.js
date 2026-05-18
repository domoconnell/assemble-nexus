import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/db/index.js";
import {
	tenancy_session,
	tenancy_invoice,
} from "@/db/schema/entities/tenancy.js";
import {
	listActivePrivateRentals,
	listActiveScheduledTenancies,
	getInvoiceForPeriod,
	insertInvoice,
	attachSessionsToInvoice,
} from "@/db/queries/tenancies.js";
import { getActiveDdDriver } from "./dd-driver.js";

function pad(n) {
	return String(n).padStart(2, "0");
}

function periodYmFor(date) {
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function generateReference(periodYm) {
	const [y] = periodYm.split("-");
	const rand = Math.floor(Math.random() * 1_000_000)
		.toString(36)
		.toUpperCase()
		.padStart(4, "0")
		.slice(0, 6);
	return `TI-${y}-${rand}`;
}

async function findSessionsForMonth(tenancyId, periodYm) {
	const [y, m] = periodYm.split("-").map(Number);
	const start = new Date(Date.UTC(y, m - 1, 1));
	const next = new Date(Date.UTC(y, m, 1));
	return db
		.select({
			id: tenancy_session.id,
			starts_at: tenancy_session.starts_at,
			status: tenancy_session.status,
			rate_cents_snapshot: tenancy_session.rate_cents_snapshot,
			invoice_id: tenancy_session.invoice_id,
		})
		.from(tenancy_session)
		.where(
			and(
				eq(tenancy_session.tenancy_id, tenancyId),
				isNull(tenancy_session.deletedAt),
				gte(tenancy_session.starts_at, start),
				lt(tenancy_session.starts_at, next),
			),
		);
}

/**
 * Generate any tenancy invoices that are due today. A tenancy is "due"
 * when today's date-of-month matches its `invoice_day_of_month` and no
 * invoice exists yet for the current period.
 *
 * Today's date is taken from `today` (Date or null = now). Each call is
 * idempotent per (tenancy, period) - we look up by period_ym first.
 *
 * Private rentals bill the flat monthly rate.
 * Scheduled-recurring bills the sum of completed/scheduled sessions in
 * the period at each session's snapshotted rate.
 *
 * The session-attach step ties session rows to the invoice so they can't
 * be billed again (and changes status to `completed`).
 */
export async function issueTenancyInvoicesForToday(venueId, today = new Date()) {
	const dayOfMonth = today.getUTCDate();
	const periodYm = periodYmFor(today);
	const results = [];

	const [privateTenancies, scheduledTenancies] = await Promise.all([
		listActivePrivateRentals(venueId),
		listActiveScheduledTenancies(venueId),
	]);

	for (const t of [...privateTenancies, ...scheduledTenancies]) {
		if (t.invoice_day_of_month !== dayOfMonth) continue;
		try {
			const existing = await getInvoiceForPeriod(t.id, periodYm);
			if (existing) {
				results.push({ tenancy_id: t.id, period: periodYm, skipped: "already_invoiced" });
				continue;
			}

			let subtotal_cents = 0;
			let sessionIds = [];

			if (t.kind === "private_rental") {
				subtotal_cents = t.monthly_rate_cents ?? 0;
			} else {
				const sessions = await findSessionsForMonth(t.id, periodYm);
				const billable = sessions.filter(
					(s) => s.status !== "cancelled" && !s.invoice_id,
				);
				subtotal_cents = billable.reduce(
					(sum, s) => sum + (s.rate_cents_snapshot ?? 0),
					0,
				);
				sessionIds = billable.map((s) => s.id);
			}

			if (subtotal_cents <= 0) {
				results.push({ tenancy_id: t.id, period: periodYm, skipped: "zero_amount" });
				continue;
			}

			const inv = await insertInvoice({
				tenancy_id: t.id,
				venue_id: t.venue_id,
				reference: generateReference(periodYm),
				period_ym: periodYm,
				status: "issued",
				subtotal_cents,
				vat_cents: 0,
				total_cents: subtotal_cents,
				issued_at: new Date(),
			});

			if (sessionIds.length > 0) {
				await attachSessionsToInvoice(sessionIds, inv.id);
			}

			// If a Direct Debit mandate is on file, automatically initiate
			// a Stripe charge against it. Bacs takes a few business days to
			// clear; the resulting PaymentIntent will start as `processing`.
			let charge = null;
			let chargeError = null;
			if (t.direct_debit_mandate_id && t.stripe_customer_id) {
				try {
					const driver = await getActiveDdDriver(t.venue_id);
					const pi = await driver.chargeMandate({
						customerId: t.stripe_customer_id,
						paymentMethodId: t.direct_debit_mandate_id,
						amountCents: subtotal_cents,
						description: `${inv.reference} · ${periodYm}`,
						metadata: {
							tenancy_id: t.id,
							tenancy_invoice_id: inv.id,
							period_ym: periodYm,
						},
					});
					charge = { payment_intent_id: pi.id, status: pi.status };
				} catch (err) {
					chargeError = err.message;
					console.error(`[tenancy-charge] ${t.id}:`, err.message);
				}
			}

			results.push({
				tenancy_id: t.id,
				period: periodYm,
				invoice_id: inv.id,
				total_cents: subtotal_cents,
				sessions: sessionIds.length,
				charge,
				charge_error: chargeError,
			});
		} catch (err) {
			results.push({
				tenancy_id: t.id,
				period: periodYm,
				error: err?.message || String(err),
			});
		}
	}

	return results;
}
