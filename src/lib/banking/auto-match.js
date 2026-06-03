import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { bank_transaction } from "@/db/schema/entities/bank_transaction.js";
import { tenancy, tenancy_invoice } from "@/db/schema/entities/tenancy.js";
import { organisation } from "@/db/schema/entities/organisation.js";
import { contact } from "@/db/schema/entities/contact.js";

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
			amount_minor: bank_transaction.amount_minor,
			reference: bank_transaction.reference,
			counterparty_name: bank_transaction.counterparty_name,
			settled_at: bank_transaction.settled_at,
			transaction_time: bank_transaction.transaction_time,
		})
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.venue_id, venueId),
				eq(bank_transaction.direction, "IN"),
				eq(bank_transaction.is_transfer, false),
				eq(bank_transaction.is_church_transfer, false),
				isNull(bank_transaction.matched_to_id),
			),
		);

	if (unmatched.length === 0) {
		return { checked: 0, matched: 0, ambiguous: 0 };
	}

	// Join invoices to the org + primary contact so we can build a name
	// haystack per candidate without a second round-trip.
	const candidateInvoices = await db
		.select({
			id: tenancy_invoice.id,
			reference: tenancy_invoice.reference,
			total_cents: tenancy_invoice.total_cents,
			organisation_name: organisation.name,
			contact_first_name: contact.first_name,
			contact_last_name: contact.last_name,
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
		);

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
			ambiguous++;
		}
	}

	return { checked: unmatched.length, matched, ambiguous };
}

async function commitMatch(tx, invoice) {
	const paidAt = tx.transaction_time ?? tx.settled_at ?? new Date();
	await db
		.update(bank_transaction)
		.set({ matched_to_id: invoice.id, matched_to_type: "tenancy_invoice" })
		.where(eq(bank_transaction.id, tx.id));
	await db
		.update(tenancy_invoice)
		.set({ status: "paid", paid_at: paidAt })
		.where(and(eq(tenancy_invoice.id, invoice.id), eq(tenancy_invoice.status, "issued")));
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
	for (const raw of [inv.organisation_name, inv.contact_first_name, inv.contact_last_name]) {
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
