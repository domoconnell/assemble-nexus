import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/db/index.js";
import { tenancy_session } from "@/db/schema/entities/tenancy.js";
import {
	listActiveTenancies,
	listLinesForTenancy,
	getInvoiceForPeriod,
	insertInvoice,
	insertInvoiceLines,
	attachSessionsToInvoice,
} from "@/db/queries/tenancies.js";
import { computeInvoiceForMonth } from "./billing.js";
import { getActiveDdDriver } from "./dd-driver.js";
import { listRoomRackHourlyRates } from "@/db/queries/room-rack-rates.js";
import { updateInvoice } from "@/db/queries/tenancies.js";

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
			tenancy_line_id: tenancy_session.tenancy_line_id,
			starts_at: tenancy_session.starts_at,
			ends_at: tenancy_session.ends_at,
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
 * Build + persist a tenancy invoice for a specific period. Shared between
 * the daily cron and the admin "create invoice now" button. Throws on
 * duplicate / empty lines / zero amount; the caller decides how to react.
 *
 * Pass `attemptAutoBill` to also charge the org's DD mandate if the tenancy
 * is configured for it (cron behaviour). The manual path leaves this off
 * so an admin can issue the invoice and then click "Take by direct debit"
 * separately.
 */
export async function issueInvoiceForTenancyPeriod({
	tenancy: t,
	periodYm,
	rackRatesByRoomId,
	issuedAt = new Date(),
	attemptAutoBill = false,
}) {
	const existing = await getInvoiceForPeriod(t.id, periodYm);
	if (existing) {
		const err = new Error(`An invoice for ${periodYm} already exists.`);
		err.code = "already_invoiced";
		throw err;
	}

	const lines = await listLinesForTenancy(t.id);
	if (lines.length === 0) {
		const err = new Error("Tenancy has no lines to bill.");
		err.code = "no_lines";
		throw err;
	}

	const sessions = await findSessionsForMonth(t.id, periodYm);
	const sessionsByLine = new Map();
	for (const s of sessions) {
		if (!s.tenancy_line_id) continue;
		const arr = sessionsByLine.get(s.tenancy_line_id) ?? [];
		arr.push(s);
		sessionsByLine.set(s.tenancy_line_id, arr);
	}

	const computed = computeInvoiceForMonth({
		tenancy: t,
		lines,
		sessionsByLine,
		rackRatesByRoomId,
	});

	if (computed.billed_cents <= 0) {
		const err = new Error("Computed total is zero — nothing to invoice.");
		err.code = "zero_amount";
		throw err;
	}

	const inv = await insertInvoice({
		tenancy_id: t.id,
		venue_id: t.venue_id,
		reference: generateReference(periodYm),
		period_ym: periodYm,
		status: "issued",
		subtotal_cents: computed.billed_cents,
		uncapped_subtotal_cents: computed.uncapped_subtotal_cents,
		rack_subtotal_cents: computed.rack_subtotal_cents ?? null,
		line_discount_total_cents: computed.line_discount_total_cents ?? 0,
		vat_cents: 0,
		total_cents: computed.billed_cents,
		issued_at: issuedAt,
	});

	await insertInvoiceLines(
		computed.lines.map((l, i) => ({
			invoice_id: inv.id,
			tenancy_line_id: l.tenancy_line_id,
			description: l.description,
			kind: l.kind,
			billing_mode: l.billing_mode,
			quantity: l.quantity,
			unit_cents: l.unit_cents,
			amount_cents: l.amount_cents,
			rack_hourly_rate_cents: l.rack_hourly_rate_cents ?? null,
			rack_cents: l.rack_cents ?? null,
			discount_cents: l.discount_cents ?? null,
			sort_order: i,
		})),
	);

	// Lock in every billable session against the invoice so they can't
	// be re-billed next month. Cancelled / already-invoiced rows are
	// skipped.
	const sessionIds = sessions
		.filter((s) => s.status !== "cancelled" && !s.invoice_id)
		.map((s) => s.id);
	if (sessionIds.length > 0) {
		await attachSessionsToInvoice(sessionIds, inv.id);
	}

	let charge = null;
	let chargeError = null;
	if (
		attemptAutoBill &&
		t.auto_bill_via_dd &&
		t.org_direct_debit_mandate_id &&
		t.org_stripe_customer_id
	) {
		try {
			const driver = await getActiveDdDriver(t.venue_id);
			const pi = await driver.chargeMandate({
				customerId: t.org_stripe_customer_id,
				paymentMethodId: t.org_direct_debit_mandate_id,
				amountCents: computed.billed_cents,
				description: `${inv.reference} · ${periodYm}`,
				metadata: {
					tenancy_id: t.id,
					tenancy_invoice_id: inv.id,
					tenancy_invoice_reference: inv.reference,
					organisation_id: t.organisation_id,
					period_ym: periodYm,
				},
			});
			charge = { payment_intent_id: pi.id, status: pi.status };
			await updateInvoice(inv.id, {
				stripe_payment_intent_id: pi.id,
				dd_charge_status: pi.status,
				dd_charged_at: new Date(),
			});
		} catch (err) {
			chargeError = err.message;
			console.error(`[tenancy-charge] ${t.id}:`, err.message);
		}
	}

	return {
		invoice: inv,
		total_cents: computed.billed_cents,
		lines: computed.lines.length,
		sessions: sessionIds.length,
		charge,
		charge_error: chargeError,
	};
}

/**
 * Generate any tenancy invoices that are due today. A tenancy is "due"
 * when today's date-of-month matches its `invoice_day_of_month` and no
 * invoice exists yet for the current period.
 *
 * Idempotent per (tenancy, period).
 */
export async function issueTenancyInvoicesForToday(venueId, today = new Date()) {
	const dayOfMonth = today.getUTCDate();
	const periodYm = periodYmFor(today);
	const results = [];

	const tenancies = await listActiveTenancies(venueId);
	const rackRatesByRoomId = await listRoomRackHourlyRates(venueId);

	for (const t of tenancies) {
		if (t.invoice_day_of_month !== dayOfMonth) continue;
		try {
			const result = await issueInvoiceForTenancyPeriod({
				tenancy: t,
				periodYm,
				rackRatesByRoomId,
				issuedAt: today,
				attemptAutoBill: true,
			});
			results.push({
				tenancy_id: t.id,
				period: periodYm,
				invoice_id: result.invoice.id,
				total_cents: result.total_cents,
				lines: result.lines,
				sessions: result.sessions,
				charge: result.charge,
				charge_error: result.charge_error,
			});
		} catch (err) {
			if (err?.code) {
				results.push({ tenancy_id: t.id, period: periodYm, skipped: err.code });
			} else {
				results.push({
					tenancy_id: t.id,
					period: periodYm,
					error: err?.message || String(err),
				});
			}
		}
	}

	return results;
}

/**
 * Submit a Stripe Bacs charge against the organisation's DD mandate for
 * a specific tenancy invoice. Called by the admin "Take by direct debit"
 * button on the invoice row. Refuses on missing mandate, already-paid,
 * voided, or in-flight (status already pending/processing/succeeded).
 *
 * Persists the resulting PaymentIntent id + status on the invoice so the
 * UI can show "submitted / processing / succeeded / failed" without
 * re-querying Stripe.
 */
export async function chargeTenancyInvoice({ invoice, tenancy, venueId }) {
	if (invoice.status === "paid") {
		const err = new Error("Invoice is already marked paid.");
		err.code = "already_paid";
		throw err;
	}
	if (invoice.status === "void") {
		const err = new Error("Invoice has been voided.");
		err.code = "voided";
		throw err;
	}
	if (
		invoice.dd_charge_status &&
		["pending", "processing", "succeeded"].includes(invoice.dd_charge_status)
	) {
		const err = new Error(
			`A direct-debit charge for this invoice is already ${invoice.dd_charge_status}.`,
		);
		err.code = "already_charged";
		throw err;
	}
	if (!tenancy?.org_direct_debit_mandate_id || !tenancy?.org_stripe_customer_id) {
		const err = new Error("This organisation has no active direct debit mandate.");
		err.code = "no_mandate";
		throw err;
	}

	const driver = await getActiveDdDriver(venueId);
	const pi = await driver.chargeMandate({
		customerId: tenancy.org_stripe_customer_id,
		paymentMethodId: tenancy.org_direct_debit_mandate_id,
		amountCents: invoice.total_cents ?? invoice.subtotal_cents,
		description: `${invoice.reference} · ${invoice.period_ym}`,
		metadata: {
			tenancy_id: tenancy.id,
			tenancy_invoice_id: invoice.id,
			tenancy_invoice_reference: invoice.reference,
			organisation_id: tenancy.organisation_id,
			period_ym: invoice.period_ym,
		},
	});
	await updateInvoice(invoice.id, {
		stripe_payment_intent_id: pi.id,
		dd_charge_status: pi.status,
		dd_charged_at: new Date(),
	});
	return { payment_intent_id: pi.id, status: pi.status };
}
