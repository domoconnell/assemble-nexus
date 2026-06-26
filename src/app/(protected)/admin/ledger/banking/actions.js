"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/index.js";
import { bank_transaction } from "@/db/schema/entities/bank_transaction.js";
import { expense } from "@/db/schema/entities/expense.js";
import { expense_category } from "@/db/schema/entities/expense_category.js";
import { recurring_cost_item } from "@/db/schema/entities/recurring_cost_item.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { runBankSync } from "@/lib/banking/sync.js";
import { autoMatchInboundTransactions } from "@/lib/banking/auto-match.js";
import { tenancy_invoice } from "@/db/schema/entities/tenancy.js";
import { manual_invoice, manual_invoice_line } from "@/db/schema/entities/manual_invoice.js";
import { nextManualInvoiceReference } from "@/db/queries/manual-invoices.js";

const ToggleSchema = z.object({
	transaction_id: z.string().uuid(),
	is_church_transfer: z.boolean(),
});

/**
 * Flip a transaction's is_church_transfer flag. Used by the manual
 * override toggle on the banking transactions list - covers transactions
 * the auto-detector missed (or wrongly flagged).
 */
export async function setChurchTransferFlagAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = ToggleSchema.parse(input);
	const venue = await requireCurrentVenue();
	await db
		.update(bank_transaction)
		.set({ is_church_transfer: parsed.is_church_transfer })
		.where(
			and(
				eq(bank_transaction.id, parsed.transaction_id),
				eq(bank_transaction.venue_id, venue.id),
			),
		);
	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/ledger/overview");
	return { ok: true };
}

/**
 * Sync the venue's bank accounts on demand. Calls the SAME `runBankSync`
 * helper the nightly cron uses — pull every provider feed, then run
 * the auto-match pass that links inbound transactions to open tenancy
 * invoices and flips matched invoices to paid.
 */
export async function runBankSyncAction() {
	await requireServerSession({ redirectTo: "/auth/login" });
	const venue = await requireCurrentVenue();
	const result = await runBankSync({ venueId: venue.id });
	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/ledger/overview");
	revalidatePath("/admin/tenancies");
	revalidatePath("/admin/crm");
	return result;
}

const TxIdSchema = z.object({ transaction_id: z.string().uuid() });

/**
 * Unmatch a bank transaction. Clears the link on `bank_transaction` and,
 * when the match was to a tenancy_invoice that we'd flipped to paid,
 * flips it back to issued so it shows up as outstanding again. Booking
 * and other entity types are no-op'd until they have an equivalent
 * "paid → unpaid" flow.
 */
export async function unmatchTransactionAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = TxIdSchema.parse(input);
	const venue = await requireCurrentVenue();
	const [tx] = await db
		.select()
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.id, parsed.transaction_id),
				eq(bank_transaction.venue_id, venue.id),
			),
		)
		.limit(1);
	if (!tx) throw new Error("Transaction not found.");
	// Stripe-orphan rows are flagged with matched_to_type but no
	// matched_to_id. Treat them as "matched" for the purposes of unmatch.
	if (!tx.matched_to_id && !tx.matched_to_type) return { ok: true, already: true };

	if (tx.matched_to_type === "tenancy_invoice") {
		await db
			.update(tenancy_invoice)
			.set({ status: "issued", paid_at: null })
			.where(eq(tenancy_invoice.id, tx.matched_to_id));
	}
	if (tx.matched_to_type === "expense") {
		// The expense row was created on behalf of this bank transaction
		// (via categoriseTransactionAction), so undoing the match means the
		// expense shouldn't exist either. Soft-delete it so reports stop
		// counting it but the audit trail is preserved.
		await db
			.update(expense)
			.set({ deletedAt: new Date() })
			.where(eq(expense.id, tx.matched_to_id));
	}
	if (tx.matched_to_type === "manual_invoice") {
		// A manual invoice that was raised against this bank transaction
		// is now unpaid again. Keep the invoice itself (admin can resolve
		// it however they like) but clear `paid_at` so it shows as
		// outstanding in reports.
		await db
			.update(manual_invoice)
			.set({ paid_at: null })
			.where(eq(manual_invoice.id, tx.matched_to_id));
	}
	// matched_to_type === "stripe_orphan": matched_to_id is null and
	// there's no entity to revert. The clear-out below puts the row
	// back in the unmatched bucket so the next sync re-evaluates.
	// matched_to_type === "recurring_cost_item": no row was created on the
	// match side (the recurring cost schedule is the source of truth), so
	// we just need to clear the link below.
	await db
		.update(bank_transaction)
		.set({ matched_to_id: null, matched_to_type: null })
		.where(eq(bank_transaction.id, tx.id));

	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/ledger/expenses");
	revalidatePath("/admin/ledger/overview");
	revalidatePath("/admin/tenancies");
	revalidatePath("/admin/crm");
	return { ok: true };
}

/**
 * Rematch a single transaction. Clears any existing match (and reverts
 * the prior paid-flip), then runs the same auto-match routine the
 * Sync-now button uses against this venue. If the matcher finds a fresh
 * candidate the row is re-linked and the new invoice flipped to paid.
 *
 * The auto-matcher scans every unmatched row for the venue, not just
 * this one — that's fine because all OTHER unmatched rows would have
 * been considered on their own merits anyway and idempotency means
 * re-running the scan can only ever add matches, never break existing
 * ones.
 */
export async function rematchTransactionAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = TxIdSchema.parse(input);
	const venue = await requireCurrentVenue();
	const [tx] = await db
		.select()
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.id, parsed.transaction_id),
				eq(bank_transaction.venue_id, venue.id),
			),
		)
		.limit(1);
	if (!tx) throw new Error("Transaction not found.");

	if (tx.matched_to_id && tx.matched_to_type === "tenancy_invoice") {
		await db
			.update(tenancy_invoice)
			.set({ status: "issued", paid_at: null })
			.where(eq(tenancy_invoice.id, tx.matched_to_id));
	}
	if (tx.matched_to_id) {
		await db
			.update(bank_transaction)
			.set({ matched_to_id: null, matched_to_type: null })
			.where(eq(bank_transaction.id, tx.id));
	}

	const result = await autoMatchInboundTransactions(venue.id);
	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/tenancies");
	revalidatePath("/admin/crm");
	return { ok: true, ...result };
}

const CategoriseSchema = z
	.object({
		transaction_id: z.string().uuid(),
		kind: z.enum(["spend", "refund"]),
		// Exactly one of these is set, decided in the dropdown.
		expense_category_id: z.string().uuid().optional().nullable(),
		recurring_cost_item_id: z.string().uuid().optional().nullable(),
		description: z.string().min(1).max(500),
		supplier_name: z.string().max(200).optional().nullable(),
		notes: z.string().max(2000).optional().nullable(),
		vat_cents: z.coerce.number().int().min(0).optional().nullable(),
	})
	.refine(
		(v) => Boolean(v.expense_category_id) !== Boolean(v.recurring_cost_item_id),
		{ message: "Pick exactly one of expense_category_id or recurring_cost_item_id." },
	);

/**
 * Categorise a bank transaction. There are two flavours of target:
 *
 *   1. **expense_category_id** — a variable expense category (Supplies,
 *      Cleaning, …). We create a fresh `expense` row that captures the
 *      bank transaction's amount + date + description + supplier, then
 *      link the bank row to it via `matched_to_type = "expense"`. This
 *      is also how refunds against variable categories are recorded —
 *      `kind = "refund"` on the expense row, reports do the netting.
 *
 *   2. **recurring_cost_item_id** — one of the items under a recurring
 *      cost type (utilities · Electric, mortgage · Default, …). We DO
 *      NOT create an expense row — the recurring cost schedule already
 *      tracks the canonical monthly amount, and adding an expense row
 *      would double-count. Instead, we just link the bank transaction
 *      via `matched_to_type = "recurring_cost_item"`. Reports computing
 *      "actual spend on Electric this month" sum the bank_transaction
 *      rows linked to that item, with refunds counted as IN direction.
 *
 * Spend↔OUT and refund↔IN are still enforced as defence-in-depth.
 */
export async function categoriseTransactionAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = CategoriseSchema.parse(input);
	const venue = await requireCurrentVenue();

	const [tx] = await db
		.select()
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.id, parsed.transaction_id),
				eq(bank_transaction.venue_id, venue.id),
			),
		)
		.limit(1);
	if (!tx) throw new Error("Transaction not found.");
	if (tx.matched_to_id) {
		throw new Error("Transaction is already matched. Unmatch it first.");
	}
	if (parsed.kind === "spend" && tx.direction !== "OUT") {
		throw new Error("Only outgoing transactions can be categorised as spending.");
	}
	if (parsed.kind === "refund" && tx.direction !== "IN") {
		throw new Error("Only incoming transactions can be marked as a refund.");
	}

	// Branch 2 first: linking to a recurring cost item.
	if (parsed.recurring_cost_item_id) {
		const [item] = await db
			.select({ id: recurring_cost_item.id })
			.from(recurring_cost_item)
			.where(
				and(
					eq(recurring_cost_item.id, parsed.recurring_cost_item_id),
					eq(recurring_cost_item.venue_id, venue.id),
				),
			)
			.limit(1);
		if (!item) throw new Error("Recurring cost item not found for this venue.");

		await db
			.update(bank_transaction)
			.set({
				matched_to_id: item.id,
				matched_to_type: "recurring_cost_item",
			})
			.where(eq(bank_transaction.id, tx.id));

		revalidatePath("/admin/ledger/banking");
		revalidatePath("/admin/ledger/recurring");
		revalidatePath("/admin/ledger/overview");
		return { ok: true, matched_to_type: "recurring_cost_item", item_id: item.id };
	}

	// Branch 1: variable expense category — create an expense row.
	const [cat] = await db
		.select({ id: expense_category.id })
		.from(expense_category)
		.where(
			and(
				eq(expense_category.id, parsed.expense_category_id),
				eq(expense_category.venue_id, venue.id),
			),
		)
		.limit(1);
	if (!cat) throw new Error("Category not found for this venue.");

	const ymdLondon = (d) => {
		const fmt = new Intl.DateTimeFormat("en-CA", {
			year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/London",
		});
		return fmt.format(d);
	};
	const dateString = ymdLondon(tx.transaction_time ?? tx.settled_at ?? new Date());

	const [created] = await db
		.insert(expense)
		.values({
			venue_id: venue.id,
			kind: parsed.kind,
			expense_category_id: parsed.expense_category_id,
			date: dateString,
			description: parsed.description.trim(),
			amount_cents: tx.amount_minor,
			vat_cents: parsed.vat_cents ?? 0,
			supplier_name: parsed.supplier_name?.trim() || null,
			notes: parsed.notes?.trim() || null,
		})
		.returning();

	await db
		.update(bank_transaction)
		.set({ matched_to_id: created.id, matched_to_type: "expense" })
		.where(eq(bank_transaction.id, tx.id));

	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/ledger/expenses");
	revalidatePath("/admin/ledger/overview");
	return { ok: true, matched_to_type: "expense", expense_id: created.id };
}

/* ------------------------------------------------------------------------ */
/* Manual invoices                                                          */
/* ------------------------------------------------------------------------ */

const InvoiceLineSchema = z.object({
	description: z.string().min(1).max(500),
	amount_cents: z.coerce.number().int().min(0),
});

const ManualInvoiceUpsertSchema = z
	.object({
		// When set we're editing — must already exist + belong to venue.
		invoice_id: z.string().uuid().optional().nullable(),
		// When set we're creating from a bank transaction match; the
		// invoice's total will be capped at that transaction's amount via
		// an auto-derived discount.
		bank_transaction_id: z.string().uuid().optional().nullable(),
		organisation_id: z.string().uuid().optional().nullable(),
		customer_name: z.string().max(200).optional().nullable(),
		customer_email: z.string().max(200).optional().nullable(),
		customer_address: z.string().max(1000).optional().nullable(),
		customer_vat_number: z.string().max(50).optional().nullable(),
		description: z.string().max(2000).optional().nullable(),
		notes: z.string().max(2000).optional().nullable(),
		lines: z.array(InvoiceLineSchema).min(1, "Add at least one line."),
	})
	.refine(
		(v) => Boolean(v.organisation_id) || (v.customer_name && v.customer_name.trim().length > 0),
		{ message: "Pick an organisation or enter a customer name." },
	);

function splitAddressLines(s) {
	if (!s) return null;
	const parts = String(s)
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	return parts.length > 0 ? parts : null;
}

/**
 * Create or update a manual invoice. When `bank_transaction_id` is set
 * (typical "create from bank match" path):
 *
 *   1. Validate the transaction exists, belongs to the current venue,
 *      is INCOMING, and isn't already matched.
 *   2. If line items sum to MORE than the bank amount, auto-derive a
 *      `discount_cents` so the invoice total exactly matches the
 *      received amount. The discount renders as its own line on the
 *      PDF. If lines sum to LESS, we reject — the admin should add
 *      another line so the totals reconcile.
 *   3. Insert the invoice + its lines, then link the bank transaction
 *      to it (`matched_to_type = 'manual_invoice'`).
 *   4. Stamp `paid_at` on the invoice because the bank transaction
 *      represents settlement.
 *
 * When `invoice_id` is set we're editing an existing invoice — replace
 * the lines + recompute totals. We don't touch the bank link since
 * unmatching is handled separately.
 */
export async function upsertManualInvoiceAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = ManualInvoiceUpsertSchema.parse(input);
	const venue = await requireCurrentVenue();

	const subtotal = parsed.lines.reduce((s, l) => s + (l.amount_cents ?? 0), 0);

	let bankTx = null;
	let discountCents = 0;
	if (parsed.bank_transaction_id) {
		const [row] = await db
			.select()
			.from(bank_transaction)
			.where(
				and(
					eq(bank_transaction.id, parsed.bank_transaction_id),
					eq(bank_transaction.venue_id, venue.id),
				),
			)
			.limit(1);
		if (!row) throw new Error("Bank transaction not found.");
		if (row.direction !== "IN") {
			throw new Error("Only incoming transactions can have an invoice raised against them.");
		}
		// When editing an existing invoice that's ALREADY linked to this
		// transaction the match is fine — only block if the transaction is
		// linked to something ELSE.
		if (
			row.matched_to_id &&
			!(parsed.invoice_id && row.matched_to_id === parsed.invoice_id)
		) {
			throw new Error("That transaction is already matched. Unmatch it first.");
		}
		bankTx = row;
		// Derive a discount so the invoice total matches the bank
		// transaction amount. Reject if the lines undershoot — adding a
		// negative discount (i.e. surcharge) doesn't make sense as a
		// "discount", and the admin can always add another line.
		const target = row.amount_minor ?? 0;
		if (subtotal > target) {
			discountCents = subtotal - target;
		} else if (subtotal < target) {
			throw new Error(
				`Line items total £${(subtotal / 100).toFixed(2)} but the bank received £${(target / 100).toFixed(2)}. Add another line so the invoice covers the full amount.`,
			);
		}
	}

	const total = subtotal - discountCents;

	const sharedFields = {
		organisation_id: parsed.organisation_id ?? null,
		customer_name: parsed.customer_name?.trim() || null,
		customer_email: parsed.customer_email?.trim() || null,
		customer_address_lines: splitAddressLines(parsed.customer_address),
		customer_vat_number: parsed.customer_vat_number?.trim() || null,
		description: parsed.description?.trim() || null,
		notes: parsed.notes?.trim() || null,
		subtotal_cents: subtotal,
		discount_cents: discountCents,
		vat_cents: 0,
		total_cents: total,
	};

	let invoiceId;
	if (parsed.invoice_id) {
		// Edit path
		const [existing] = await db
			.select()
			.from(manual_invoice)
			.where(
				and(
					eq(manual_invoice.id, parsed.invoice_id),
					eq(manual_invoice.venue_id, venue.id),
				),
			)
			.limit(1);
		if (!existing) throw new Error("Invoice not found.");
		await db
			.update(manual_invoice)
			.set(sharedFields)
			.where(eq(manual_invoice.id, existing.id));
		await db.delete(manual_invoice_line).where(eq(manual_invoice_line.invoice_id, existing.id));
		invoiceId = existing.id;
	} else {
		// Create path
		const reference = await nextManualInvoiceReference(venue.id);
		const [created] = await db
			.insert(manual_invoice)
			.values({
				venue_id: venue.id,
				reference,
				...sharedFields,
				paid_at: bankTx ? new Date() : null,
			})
			.returning();
		invoiceId = created.id;

		// Link the bank transaction to the new invoice (if we have one).
		if (bankTx) {
			await db
				.update(bank_transaction)
				.set({ matched_to_id: invoiceId, matched_to_type: "manual_invoice" })
				.where(eq(bank_transaction.id, bankTx.id));
		}
	}

	// Insert (or re-insert) the lines.
	await db.insert(manual_invoice_line).values(
		parsed.lines.map((l, i) => ({
			invoice_id: invoiceId,
			description: l.description.trim(),
			amount_cents: l.amount_cents,
			sort_order: i,
		})),
	);

	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/crm");
	return { ok: true, invoice_id: invoiceId };
}

const ManualInvoiceIdSchema = z.object({ invoice_id: z.string().uuid() });

/**
 * Soft-delete a manual invoice. The matched bank transaction (if any)
 * has its link cleared as a side-effect — the bank row goes back to
 * Unmatched, not to a dangling pointer.
 */
export async function deleteManualInvoiceAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = ManualInvoiceIdSchema.parse(input);
	const venue = await requireCurrentVenue();
	await db
		.update(manual_invoice)
		.set({ deletedAt: new Date() })
		.where(
			and(eq(manual_invoice.id, parsed.invoice_id), eq(manual_invoice.venue_id, venue.id)),
		);
	await db
		.update(bank_transaction)
		.set({ matched_to_id: null, matched_to_type: null })
		.where(
			and(
				eq(bank_transaction.matched_to_id, parsed.invoice_id),
				eq(bank_transaction.matched_to_type, "manual_invoice"),
			),
		);
	revalidatePath("/admin/ledger/banking");
	return { ok: true };
}

/**
 * Fetch a manual invoice + its lines for the edit dialog. Returns null
 * if not found (or not this venue's), so the caller can branch into a
 * "deleted" state rather than throwing.
 */
export async function getManualInvoiceForEditAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const venue = await requireCurrentVenue();
	const { invoice_id } = z.object({ invoice_id: z.string().uuid() }).parse(input);
	const { getManualInvoiceById, listManualInvoiceLines } = await import(
		"@/db/queries/manual-invoices.js"
	);
	const invoice = await getManualInvoiceById(invoice_id, { venueId: venue.id });
	if (!invoice) return null;
	const lines = await listManualInvoiceLines(invoice_id);
	return { invoice, lines };
}

/* ------------------------------------------------------------------------ */
/* Manual match picker                                                      */
/* ------------------------------------------------------------------------ */

const ListCandidatesSchema = z.object({ transaction_id: z.string().uuid() });

/**
 * Return the open / unpaid invoices that an admin could manually link a
 * bank transaction to. Covers BOTH:
 *
 *   - `tenancy_invoice` rows still at status='issued'
 *   - `manual_invoice` rows with no `paid_at`
 *
 * Ranking is amount-match first (so the row at the EXACT same £ as the
 * bank transaction floats to the top), then most-recently-issued. Used
 * by the "Match to invoice…" dialog in MatchCell — the auto-matcher
 * itself is intentionally conservative and abstains on amount-only
 * matches; this picker is the manual fallback for those cases.
 */
export async function listMatchCandidatesAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = ListCandidatesSchema.parse(input);
	const venue = await requireCurrentVenue();

	const [tx] = await db
		.select()
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.id, parsed.transaction_id),
				eq(bank_transaction.venue_id, venue.id),
			),
		)
		.limit(1);
	if (!tx) throw new Error("Transaction not found.");
	const amount = tx.amount_minor ?? 0;

	const { tenancy, tenancy_invoice } = await import(
		"@/db/schema/entities/tenancy.js"
	);
	const { organisation } = await import(
		"@/db/schema/entities/organisation.js"
	);
	const { isNull, desc } = await import("drizzle-orm");

	const [tenancyRows, manualRows] = await Promise.all([
		db
			.select({
				type: tenancy_invoice.id, // placeholder; we override below
				id: tenancy_invoice.id,
				reference: tenancy_invoice.reference,
				total_cents: tenancy_invoice.total_cents,
				issued_at: tenancy_invoice.issued_at,
				organisation_name: organisation.name,
			})
			.from(tenancy_invoice)
			.innerJoin(tenancy, eq(tenancy.id, tenancy_invoice.tenancy_id))
			.leftJoin(organisation, eq(organisation.id, tenancy.organisation_id))
			.where(
				and(
					eq(tenancy_invoice.venue_id, venue.id),
					eq(tenancy_invoice.status, "issued"),
					isNull(tenancy_invoice.deletedAt),
				),
			)
			.orderBy(desc(tenancy_invoice.issued_at))
			.limit(200),
		db
			.select({
				id: manual_invoice.id,
				reference: manual_invoice.reference,
				total_cents: manual_invoice.total_cents,
				issued_at: manual_invoice.issued_at,
				organisation_id: manual_invoice.organisation_id,
				organisation_name: organisation.name,
				customer_name: manual_invoice.customer_name,
			})
			.from(manual_invoice)
			.leftJoin(organisation, eq(organisation.id, manual_invoice.organisation_id))
			.where(
				and(
					eq(manual_invoice.venue_id, venue.id),
					isNull(manual_invoice.paid_at),
					isNull(manual_invoice.deletedAt),
				),
			)
			.orderBy(desc(manual_invoice.issued_at))
			.limit(200),
	]);

	const candidates = [
		...tenancyRows.map((r) => ({
			type: "tenancy_invoice",
			id: r.id,
			reference: r.reference,
			total_cents: r.total_cents,
			issued_at: r.issued_at,
			label: r.organisation_name ?? "Tenancy",
		})),
		...manualRows.map((r) => ({
			type: "manual_invoice",
			id: r.id,
			reference: r.reference,
			total_cents: r.total_cents,
			issued_at: r.issued_at,
			label: r.organisation_name ?? r.customer_name ?? "Manual invoice",
		})),
	];

	// Amount match floats to the top. Within each bucket we already
	// ordered by issued_at desc from the SQL, so a simple stable sort
	// preserves that — sort with a key but keep relative order.
	const withRank = candidates.map((c, i) => ({
		c,
		i,
		exact: c.total_cents === amount,
	}));
	withRank.sort((a, b) => {
		if (a.exact !== b.exact) return a.exact ? -1 : 1;
		return a.i - b.i;
	});

	return {
		transaction: {
			id: tx.id,
			amount_minor: tx.amount_minor,
			counterparty_name: tx.counterparty_name,
			reference: tx.reference,
		},
		candidates: withRank.map((r) => r.c),
	};
}

const ManualMatchSchema = z.object({
	transaction_id: z.string().uuid(),
	target_type: z.enum(["tenancy_invoice", "manual_invoice"]),
	target_id: z.string().uuid(),
});

/**
 * Link a bank transaction to an invoice the user picked from the
 * candidates dialog. Mirrors the side-effects of the auto-matcher so
 * the resulting state is identical to the "matched automatically" path:
 *
 *   - tenancy_invoice  → status='paid', paid_at = settlement time
 *   - manual_invoice   → paid_at      = settlement time
 *
 * Refuses to overwrite an existing match — the admin must unmatch first.
 */
export async function manuallyMatchToInvoiceAction(input) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const parsed = ManualMatchSchema.parse(input);
	const venue = await requireCurrentVenue();

	const [tx] = await db
		.select()
		.from(bank_transaction)
		.where(
			and(
				eq(bank_transaction.id, parsed.transaction_id),
				eq(bank_transaction.venue_id, venue.id),
			),
		)
		.limit(1);
	if (!tx) throw new Error("Transaction not found.");
	if (tx.matched_to_id) {
		throw new Error("Already matched. Unmatch first.");
	}
	if (tx.direction !== "IN") {
		throw new Error("Only incoming transactions can be matched to invoices.");
	}

	const paidAt = tx.transaction_time ?? tx.settled_at ?? new Date();

	if (parsed.target_type === "tenancy_invoice") {
		const [inv] = await db
			.select()
			.from(tenancy_invoice)
			.where(
				and(
					eq(tenancy_invoice.id, parsed.target_id),
					eq(tenancy_invoice.venue_id, venue.id),
				),
			)
			.limit(1);
		if (!inv) throw new Error("Invoice not found.");
		await db
			.update(tenancy_invoice)
			.set({ status: "paid", paid_at: paidAt })
			.where(eq(tenancy_invoice.id, inv.id));
	} else {
		const [inv] = await db
			.select()
			.from(manual_invoice)
			.where(
				and(
					eq(manual_invoice.id, parsed.target_id),
					eq(manual_invoice.venue_id, venue.id),
				),
			)
			.limit(1);
		if (!inv) throw new Error("Invoice not found.");
		await db
			.update(manual_invoice)
			.set({ paid_at: paidAt })
			.where(eq(manual_invoice.id, inv.id));
	}

	await db
		.update(bank_transaction)
		.set({ matched_to_id: parsed.target_id, matched_to_type: parsed.target_type })
		.where(eq(bank_transaction.id, tx.id));

	revalidatePath("/admin/ledger/banking");
	revalidatePath("/admin/tenancies");
	revalidatePath("/admin/crm");
	return { ok: true };
}
