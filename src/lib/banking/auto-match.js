import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { bank_transaction } from "@/db/schema/entities/bank_transaction.js";
import { tenancy, tenancy_invoice } from "@/db/schema/entities/tenancy.js";
import { organisation } from "@/db/schema/entities/organisation.js";
import { contact } from "@/db/schema/entities/contact.js";
import { booking_payment } from "@/db/schema/entities/booking_payment.js";
import { booking } from "@/db/schema/entities/booking.js";
import { customer } from "@/db/schema/entities/customer.js";
import { ticket_order } from "@/db/schema/entities/ticket_order.js";
import { rollUpBookingPaidAmounts } from "@/lib/bookings/payment-rollup.js";

/**
 * Auto-reconcile inbound bank transactions to tenancy invoices. Runs
 * after every sync (cron + admin "Sync now"). Idempotent — only touches
 * unmatched transactions and unpaid invoices.
 *
 * Matching is layered, conservative-by-default:
 *
 *   1. **Exact reference**  — invoice ref appears in the tx reference
 *      or counterparty_name (case-insensitive, non-alphanumeric stripped).
 *      Best signal: customer used the ref we asked for.
 *
 *   2. **Amount + name fuzz** — same amount, AND a 3+ char token from
 *      the tenancy's organisation name (or its primary contact's first/
 *      last name) appears in the tx reference + counterparty_name. Catches
 *      the common "customer forgot the invoice ref and used their own
 *      name" case (e.g. "NATASHABARNES" against invoice for org "Natasha
 *      Barnes").
 *
 *   3. **Amount-only is never enough** — if no signal beyond £ matches,
 *      we abstain. Multiple candidate invoices for the same signal also
 *      abstains (logged as `ambiguous`) so admins can pick manually.
 *
 * On a confirmed match: the bank_transaction is linked to the invoice
 * (`matched_to_id` / `matched_to_type='tenancy_invoice'`) and the
 * invoice is flipped to paid with the transaction's settlement time.
 *
 * Returns `{ checked, matched, ambiguous }`.
 */
export async function autoMatchInboundTransactions(venueId) {
	if (!venueId) return { checked: 0, matched: 0, ambiguous: 0 };

	const unmatched = await db
		.select({
			id: bank_transaction.id,
			source: bank_transaction.source,
			amount_minor: bank_transaction.amount_minor,
			reference: bank_transaction.reference,
			counterparty_name: bank_transaction.counterparty_name,
			settled_at: bank_transaction.settled_at,
			transaction_time: bank_transaction.transaction_time,
			psp_intent_external_id: bank_transaction.psp_intent_external_id,
			raw_payload: bank_transaction.raw_payload,
			matched_to_type: bank_transaction.matched_to_type,
		})
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.venue_id, venueId),
				eq(bank_transaction.direction, "IN"),
				eq(bank_transaction.is_transfer, false),
				eq(bank_transaction.is_church_transfer, false),
				isNull(bank_transaction.matched_to_id),
				// Orphans are flagged with matched_to_type='stripe_orphan'
				// (matched_to_id stays null since there's nothing to point
				// at). We must skip those here so the matcher doesn't keep
				// retrying them on every Sync.
				isNull(bank_transaction.matched_to_type),
			),
		);

	if (unmatched.length === 0) {
		return { checked: 0, matched: 0, ambiguous: 0, psp_matched: 0, orphans: 0 };
	}

	// Layer 0 (highest signal): PSP-Payment-Intent bridge. For Stripe
	// rows the ingestion stores `pi_xxx` against the bank_transaction;
	// the webhook stamps the same `pi_xxx` against `booking_payment` and
	// `ticket_order` when the customer pays. So one direct join resolves
	// the link without any fuzzy guessing.
	//
	// We run this BEFORE the tenancy fuzzy match so a Stripe deposit
	// that happens to share an amount with an open tenancy invoice can't
	// get false-positive-matched to the wrong entity.
	let pspMatched = 0;
	const pspIds = Array.from(
		new Set(unmatched.map((t) => t.psp_intent_external_id).filter(Boolean)),
	);
	if (pspIds.length > 0) {
		// Soft-deleted rows are included intentionally — a transaction
		// linked to a now-deleted booking / order still needs to reconcile
		// against the bank statement, and the UI surfaces the "deleted"
		// status so the audit trail is visible.
		const [bookingHits, ticketHits] = await Promise.all([
			db
				.select({
					id: booking_payment.id,
					pi: booking_payment.stripe_payment_intent_id,
				})
				.from(booking_payment)
				.where(inArray(booking_payment.stripe_payment_intent_id, pspIds)),
			db
				.select({
					id: ticket_order.id,
					pi: ticket_order.stripe_payment_intent_id,
				})
				.from(ticket_order)
				.where(inArray(ticket_order.stripe_payment_intent_id, pspIds)),
		]);
		const bookingByPi = new Map(bookingHits.map((r) => [r.pi, r.id]));
		const ticketByPi = new Map(ticketHits.map((r) => [r.pi, r.id]));

		for (const tx of unmatched) {
			if (!tx.psp_intent_external_id || tx.matched_to_id) continue;
			const bookingPaymentId = bookingByPi.get(tx.psp_intent_external_id);
			if (bookingPaymentId) {
				await db
					.update(bank_transaction)
					.set({
						matched_to_id: bookingPaymentId,
						matched_to_type: "booking_payment",
					})
					.where(eq(bank_transaction.id, tx.id));
				tx.matched_to_id = bookingPaymentId; // claim for the loop below
				pspMatched++;
				continue;
			}
			const ticketOrderId = ticketByPi.get(tx.psp_intent_external_id);
			if (ticketOrderId) {
				await db
					.update(bank_transaction)
					.set({
						matched_to_id: ticketOrderId,
						matched_to_type: "ticket_order",
					})
					.where(eq(bank_transaction.id, tx.id));
				tx.matched_to_id = ticketOrderId;
				pspMatched++;
			}
		}
	}

	// Layer 0.5: Stripe orphan detection. Some Stripe charges originated
	// from a booking / ticket order that has since been hard-deleted
	// (test data wipes, support refunds, etc). The bank receipt still
	// exists on our side and needs to reconcile, but there's no live
	// entity to link it to. We can still read the original metadata
	// (`booking_id`, `ticket_order_id`, `reference`) off the
	// `raw_payload.source.metadata` Stripe blob.
	//
	// When the referenced entity is gone we mark the row with
	// `matched_to_type='stripe_orphan'` (matched_to_id stays null). The
	// UI surfaces an "(orphan)" pill reading the original BK-/TIX- ref so
	// the audit trail isn't lost.
	let orphans = 0;
	const orphanCandidates = unmatched.filter(
		(tx) => !tx.matched_to_id && tx.source === "stripe" && tx.raw_payload,
	);
	if (orphanCandidates.length > 0) {
		const wantedBookingIds = new Set();
		const wantedBookingPaymentIds = new Set();
		const wantedTicketOrderIds = new Set();
		for (const tx of orphanCandidates) {
			const meta = tx.raw_payload?.source?.metadata ?? {};
			if (meta.booking_id) wantedBookingIds.add(meta.booking_id);
			if (meta.booking_payment_id) wantedBookingPaymentIds.add(meta.booking_payment_id);
			if (meta.ticket_order_id) wantedTicketOrderIds.add(meta.ticket_order_id);
		}
		// Probe — these queries include soft-deleted rows because we want
		// to know whether the row exists AT ALL, not just whether it's
		// currently active.
		const [bookingHits, bookingPaymentHits, ticketOrderHits] = await Promise.all([
			wantedBookingIds.size > 0
				? db
						.select({ id: booking.id })
						.from(booking)
						.where(inArray(booking.id, Array.from(wantedBookingIds)))
				: Promise.resolve([]),
			wantedBookingPaymentIds.size > 0
				? db
						.select({ id: booking_payment.id })
						.from(booking_payment)
						.where(inArray(booking_payment.id, Array.from(wantedBookingPaymentIds)))
				: Promise.resolve([]),
			wantedTicketOrderIds.size > 0
				? db
						.select({ id: ticket_order.id })
						.from(ticket_order)
						.where(inArray(ticket_order.id, Array.from(wantedTicketOrderIds)))
				: Promise.resolve([]),
		]);
		const liveBookings = new Set(bookingHits.map((r) => r.id));
		const liveBookingPayments = new Set(bookingPaymentHits.map((r) => r.id));
		const liveTicketOrders = new Set(ticketOrderHits.map((r) => r.id));

		for (const tx of orphanCandidates) {
			if (tx.matched_to_id) continue;
			const meta = tx.raw_payload?.source?.metadata ?? {};
			const bookingId = meta.booking_id ?? null;
			const bookingPaymentId = meta.booking_payment_id ?? null;
			const ticketOrderId = meta.ticket_order_id ?? null;
			if (!bookingId && !bookingPaymentId && !ticketOrderId) continue;
			const allGone =
				(!bookingId || !liveBookings.has(bookingId)) &&
				(!bookingPaymentId || !liveBookingPayments.has(bookingPaymentId)) &&
				(!ticketOrderId || !liveTicketOrders.has(ticketOrderId));
			if (!allGone) continue;
			await db
				.update(bank_transaction)
				.set({ matched_to_type: "stripe_orphan", matched_to_id: null })
				.where(eq(bank_transaction.id, tx.id));
			tx.matched_to_id = "stripe_orphan"; // sentinel to skip subsequent loops
			orphans++;
		}
	}

	// Two pools of candidates: open tenancy invoices and unpaid booking
	// payments. We join each to the same name-context (organisation +
	// primary contact, plus the customer fallback on bookings) so we can
	// build a token haystack per candidate without a second round-trip.
	const [tenancyCandidates, bookingCandidates] = await Promise.all([
		db
			.select({
				type: sql`'tenancy_invoice'`.as("type"),
				id: tenancy_invoice.id,
				reference: tenancy_invoice.reference,
				total_cents: tenancy_invoice.total_cents,
				issued_at: tenancy_invoice.issued_at,
				organisation_id: tenancy.organisation_id,
				organisation_name: organisation.name,
				contact_first_name: contact.first_name,
				contact_last_name: contact.last_name,
				customer_first_name: sql`NULL::text`.as("customer_first_name"),
				customer_last_name: sql`NULL::text`.as("customer_last_name"),
				customer_organisation: sql`NULL::text`.as("customer_organisation"),
				booking_id: sql`NULL::uuid`.as("booking_id"),
			})
			.from(tenancy_invoice)
			.innerJoin(tenancy, eq(tenancy.id, tenancy_invoice.tenancy_id))
			.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
			.leftJoin(
				contact,
				eq(
					contact.id,
					sql`COALESCE(${tenancy.contact_id}, ${organisation.primary_contact_id})`,
				),
			)
			.where(
				and(
					eq(tenancy_invoice.venue_id, venueId),
					eq(tenancy_invoice.status, "issued"),
					isNull(tenancy_invoice.deletedAt),
				),
			),
		db
			.select({
				type: sql`'booking_payment'`.as("type"),
				id: booking_payment.id,
				reference: booking.reference,
				total_cents: booking_payment.amount_cents,
				issued_at: booking_payment.createdAt,
				organisation_id: booking.organisation_id,
				organisation_name: organisation.name,
				contact_first_name: contact.first_name,
				contact_last_name: contact.last_name,
				customer_first_name: customer.first_name,
				customer_last_name: customer.last_name,
				customer_organisation: customer.organisation,
				booking_id: booking_payment.booking_id,
			})
			.from(booking_payment)
			.innerJoin(booking, eq(booking.id, booking_payment.booking_id))
			.innerJoin(customer, eq(customer.id, booking.customer_id))
			.leftJoin(organisation, eq(organisation.id, booking.organisation_id))
			.leftJoin(contact, eq(contact.id, organisation.primary_contact_id))
			.where(
				and(
					eq(booking.venue_id, venueId),
					isNull(booking_payment.paid_at),
					isNull(booking_payment.deletedAt),
					isNull(booking.deletedAt),
				),
			),
	]);

	// Merge the two pools. Each candidate now carries a `type` field so
	// `commitMatch` can dispatch the right side-effects (flip invoice to
	// paid vs. stamp payment + roll up booking totals).
	const candidateInvoices = [
		...tenancyCandidates,
		...bookingCandidates,
	];

	// Pre-index by amount for the fuzz layer.
	const byAmount = new Map();
	for (const inv of candidateInvoices) {
		const k = inv.total_cents;
		if (!byAmount.has(k)) byAmount.set(k, []);
		byAmount.get(k).push({
			...inv,
			ref_canon: canon(inv.reference),
			tokens: nameTokens(inv),
		});
	}

	let matched = 0;
	let ambiguous = 0;
	const claimed = new Set(); // invoice ids matched this run

	for (const tx of unmatched) {
		// Already linked by the PSP-Payment-Intent pass above — don't try
		// to fuzzy-match a tenancy on top.
		if (tx.matched_to_id) continue;

		const haystack = canon(`${tx.reference ?? ""} ${tx.counterparty_name ?? ""}`);
		if (!haystack) continue;

		// Layer 1: exact reference appears anywhere
		const refHit = candidateInvoices.find(
			(inv) => !claimed.has(inv.id) && canon(inv.reference) && haystack.includes(canon(inv.reference)),
		);
		if (refHit) {
			await commitMatch(tx, refHit);
			claimed.add(refHit.id);
			matched++;
			continue;
		}

		// Layer 2: amount + name-token fuzz
		const sameAmount = (byAmount.get(tx.amount_minor) ?? []).filter(
			(inv) => !claimed.has(inv.id),
		);
		if (sameAmount.length === 0) continue;

		const fuzzHits = sameAmount.filter((inv) =>
			inv.tokens.some((tok) => haystack.includes(tok)),
		);
		if (fuzzHits.length === 1) {
			await commitMatch(tx, fuzzHits[0]);
			claimed.add(fuzzHits[0].id);
			matched++;
			continue;
		}
		if (fuzzHits.length > 1) {
			// Multiple candidates at the same amount that all match a name
			// token. The common case is one tenant falling behind a few
			// months on the same monthly rent — every outstanding invoice
			// for the org hits. Standard accounting practice: apply to the
			// OLDEST outstanding (FIFO). We only do that auto-pick when
			// every candidate belongs to the SAME organisation, otherwise
			// we could be paying Org A's invoice with Org B's money.
			const orgIds = new Set(fuzzHits.map((h) => h.organisation_id));
			if (orgIds.size === 1) {
				const oldest = fuzzHits
					.slice()
					.sort((a, b) => new Date(a.issued_at) - new Date(b.issued_at))[0];
				await commitMatch(tx, oldest);
				claimed.add(oldest.id);
				matched++;
				continue;
			}
			ambiguous++;
		}
	}

	return {
		checked: unmatched.length,
		matched: matched + pspMatched + orphans,
		ambiguous,
		psp_matched: pspMatched,
		orphans,
	};
}

async function commitMatch(tx, candidate) {
	const paidAt = tx.transaction_time ?? tx.settled_at ?? new Date();
	const type = candidate.type ?? "tenancy_invoice";
	await db
		.update(bank_transaction)
		.set({ matched_to_id: candidate.id, matched_to_type: type })
		.where(eq(bank_transaction.id, tx.id));
	if (type === "tenancy_invoice") {
		await db
			.update(tenancy_invoice)
			.set({ status: "paid", paid_at: paidAt })
			.where(
				and(eq(tenancy_invoice.id, candidate.id), eq(tenancy_invoice.status, "issued")),
			);
		return;
	}
	if (type === "booking_payment") {
		// Mirror `markBookingPaymentPaidOfflineAction` so the booking's
		// status flips through approved → confirmed → completed as
		// installments land, the legacy `deposit_paid_cents` rollup stays
		// in sync, and the row carries the offline-paid pill in the UI.
		await db
			.update(booking_payment)
			.set({ paid_at: paidAt, paid_via: "offline", offline_note: "Auto-matched from bank" })
			.where(eq(booking_payment.id, candidate.id));
		await rollUpBookingPaidAmounts(candidate.booking_id);
	}
}

function canon(s) {
	return String(s ?? "")
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "");
}

/**
 * Build a set of 3+ char tokens from the org name + contact names. We
 * lowercase + strip non-alphanumerics so they can be substring-tested
 * against the canonicalised tx haystack.
 *
 * Filters out a few common stop-words ("THE", "AND", "LTD") so a tx
 * containing them doesn't trigger a false fuzz hit.
 */
function nameTokens(inv) {
	const STOP = new Set(["THE", "AND", "LTD", "LIMITED", "LLP", "INC", "CHARITY", "CIC", "TRUST", "CHURCH", "TENANT"]);
	const seen = new Set();
	const out = [];
	const sources = [
		inv.organisation_name,
		inv.contact_first_name,
		inv.contact_last_name,
		// Bookings carry the legacy customer free-text fallback (typed at
		// booking time, may still be the only identity link for older
		// rows that pre-date the CRM org).
		inv.customer_first_name,
		inv.customer_last_name,
		inv.customer_organisation,
	];
	for (const raw of sources) {
		if (!raw) continue;
		for (const piece of String(raw).split(/\s+/)) {
			const c = canon(piece);
			if (c.length < 3) continue;
			if (STOP.has(c)) continue;
			if (seen.has(c)) continue;
			seen.add(c);
			out.push(c);
		}
	}
	return out;
}
