/**
 * Stripe-as-a-bank-account provider plugin.
 *
 * Treats the venue's Stripe balance like any other bank account: the
 * dashboard sees the funds Stripe is holding, the ledger picks up the
 * underlying movements (charges, refunds, fees, payouts) as transactions
 * with directions, and the sync's "is_transfer" detector pairs Stripe
 * payouts with their corresponding inbound on the real bank so totals
 * don't double-count.
 *
 * Auth model: a Stripe secret key (`sk_live_…` or `sk_test_…`). Same key
 * shape the PSP driver already uses, which is what lets us pre-fill from
 * Settings → Payments. Stored in `bank_account.credentials.secret_key`
 * so the banking abstraction stays self-contained.
 *
 * Credentials shape:
 *   { secret_key: string }
 *
 * Currency: Stripe accounts can hold multiple currencies. We focus on
 * GBP since that's the venue's home currency; everything else is
 * ignored for both balance and transactions.
 */

const STRIPE_API = "https://api.stripe.com/v1";
const HOME_CURRENCY = "gbp";

async function stripeFetch(secretKey, path) {
	const res = await fetch(`${STRIPE_API}${path}`, {
		headers: {
			Authorization: `Bearer ${secretKey}`,
			Accept: "application/json",
		},
		cache: "no-store",
	});
	const text = await res.text();
	let json = null;
	if (text) {
		try { json = JSON.parse(text); } catch { /* */ }
	}
	if (!res.ok) {
		return {
			ok: false,
			status: res.status,
			error: json?.error?.message || `Stripe ${res.status}: ${text.slice(0, 200)}`,
		};
	}
	return { ok: true, body: json };
}

function sumByCurrency(list, currency) {
	if (!Array.isArray(list)) return 0;
	let total = 0;
	for (const entry of list) {
		if ((entry?.currency || "").toLowerCase() === currency) {
			total += Number(entry.amount ?? 0);
		}
	}
	return total;
}

export const stripeBankProvider = {
	key: "stripe",
	label: "Stripe balance",
	helpUrl: "https://dashboard.stripe.com/apikeys",

	async probe(account) {
		const creds = account.credentials ?? {};
		if (!creds.secret_key) {
			return { ok: false, error: "Paste a Stripe secret key first." };
		}
		const res = await stripeFetch(creds.secret_key, "/balance");
		if (!res.ok) {
			return {
				ok: false,
				status: res.status,
				error:
					res.status === 401
						? "Stripe rejected the secret key."
						: res.error,
			};
		}
		const cleared = sumByCurrency(res.body?.available, HOME_CURRENCY);
		return {
			ok: true,
			currency: HOME_CURRENCY.toUpperCase(),
			cleared_minor: cleared,
		};
	},

	async fetchBalance(account) {
		const creds = account.credentials ?? {};
		if (!creds.secret_key) {
			return { ok: false, error: "Missing Stripe secret key." };
		}
		const res = await stripeFetch(creds.secret_key, "/balance");
		if (!res.ok) return res;
		const cleared = sumByCurrency(res.body?.available, HOME_CURRENCY);
		const pending = sumByCurrency(res.body?.pending, HOME_CURRENCY);
		return {
			ok: true,
			cleared_minor: cleared,
			effective_minor: cleared + pending,
			pending_minor: pending,
			currency: HOME_CURRENCY.toUpperCase(),
		};
	},

	async listTransactions(account, { from, to }) {
		const creds = account.credentials ?? {};
		if (!creds.secret_key) {
			return { ok: false, error: "Missing Stripe secret key." };
		}

		const fromS = Math.floor(from.getTime() / 1000);
		const toS = Math.floor(to.getTime() / 1000);

		const items = [];
		let startingAfter = null;
		let safety = 0;
		while (safety++ < 50) {
			const params = new URLSearchParams({
				"created[gte]": String(fromS),
				"created[lt]": String(toS),
				limit: "100",
			});
			// Expand the underlying source (Charge / Refund / Payout) so we can
			// pull a meaningful counterparty name from billing_details, our
			// own metadata, or the description without a second API hop.
			params.append("expand[]", "data.source");
			if (startingAfter) params.set("starting_after", startingAfter);
			const res = await stripeFetch(creds.secret_key, `/balance_transactions?${params}`);
			if (!res.ok) return res;
			const batch = res.body?.data ?? [];
			if (batch.length === 0) break;

			for (const tx of batch) {
				const cur = (tx.currency || "").toLowerCase();
				if (cur !== HOME_CURRENCY) continue;
				const amount = Number(tx.amount ?? 0);
				if (!Number.isFinite(amount) || amount === 0) continue;
				const mapped = mapBalanceTransaction(tx);
				items.push(mapped);
				// Stripe folds the processing fee into the parent
				// balance_transaction (`fee` + `net`) rather than emitting a
				// separate one. Synthesise an OUT row so the fee shows up as
				// its own line in the ledger and the in/out totals balance.
				const fee = Number(tx.fee ?? 0);
				if (fee > 0 && tx.type !== "stripe_fee" && tx.type !== "payout_failure") {
					items.push(mapBalanceTransactionFee(tx));
				}
			}

			if (!res.body?.has_more) break;
			startingAfter = batch[batch.length - 1]?.id;
			if (!startingAfter) break;
		}

		return { ok: true, items };
	},
};

function mapBalanceTransaction(tx) {
	const amount = Number(tx.amount ?? 0);
	const direction = amount > 0 ? "IN" : "OUT";
	const settledMs = tx.available_on ? tx.available_on * 1000 : null;
	const createdMs = tx.created ? tx.created * 1000 : null;
	const src = typeof tx.source === "object" && tx.source ? tx.source : null;

	// Pull the Payment Intent id off the expanded charge / refund. The
	// auto-matcher uses this to bridge from `bank_transaction` to the
	// `booking_payment` / `ticket_order` rows that the webhook already
	// stamped with the same PI id. Refunds carry it on
	// `source.payment_intent` too. Stripe fee balance txns have no PI.
	let pspIntentExternalId = null;
	if (src) {
		if (typeof src.payment_intent === "string") {
			pspIntentExternalId = src.payment_intent;
		} else if (src.payment_intent && typeof src.payment_intent.id === "string") {
			pspIntentExternalId = src.payment_intent.id;
		}
	}

	return {
		external_id: tx.id,
		direction,
		amount_minor: Math.abs(amount),
		currency: (tx.currency || HOME_CURRENCY).toUpperCase(),
		counterparty_name: describeStripeName(tx, src),
		// Stripe doesn't expose the destination bank account directly on
		// balance_transactions - we use the type as a discriminator so the
		// sync layer can spot payouts later.
		counterparty_account: tx.type === "payout" ? "stripe_payout" : null,
		reference: describeStripeReference(tx, src),
		category_uid: tx.type ?? null,
		psp_intent_external_id: pspIntentExternalId,
		settled_at: settledMs ? new Date(settledMs) : null,
		transaction_time: createdMs ? new Date(createdMs) : null,
		raw_payload: tx,
	};
}

/**
 * Synthetic OUT row for the processing fee carried on the parent
 * balance_transaction. external_id pins to `${tx.id}#fee` so reruns
 * upsert idempotently.
 */
function mapBalanceTransactionFee(tx) {
	const fee = Number(tx.fee ?? 0);
	const settledMs = tx.available_on ? tx.available_on * 1000 : null;
	const createdMs = tx.created ? tx.created * 1000 : null;
	return {
		external_id: `${tx.id}#fee`,
		direction: "OUT",
		amount_minor: Math.abs(fee),
		currency: (tx.currency || HOME_CURRENCY).toUpperCase(),
		counterparty_name: "Stripe processing fee",
		counterparty_account: null,
		reference: tx.id,
		category_uid: "stripe_fee",
		settled_at: settledMs ? new Date(settledMs) : null,
		transaction_time: createdMs ? new Date(createdMs) : null,
		raw_payload: { synthetic_for: tx.id, fee_details: tx.fee_details ?? null },
	};
}

function describeStripeName(tx, src) {
	if (src) {
		const billingName = src.billing_details?.name?.trim();
		if (billingName) return billingName;
		const meta = src.metadata ?? {};
		const metaName =
			meta.organisation_name ||
			meta.customer_name ||
			meta.contact_name;
		if (metaName) return metaName;
		const billingEmail = src.billing_details?.email?.trim();
		if (billingEmail) return billingEmail;
		if (src.statement_descriptor) return src.statement_descriptor;
		if (src.description) return src.description;
	}
	return describeStripeType(tx);
}

function describeStripeReference(tx, src) {
	if (src) {
		const meta = src.metadata ?? {};
		const ref =
			meta.booking_reference ||
			meta.ticket_order_reference ||
			meta.tenancy_invoice_reference ||
			meta.tenancy_invoice_id ||
			meta.booking_id ||
			meta.ticket_order_id ||
			meta.organisation_id;
		if (ref) return ref;
		if (src.description) return src.description;
	}
	return tx.description ?? null;
}

function describeStripeType(tx) {
	const t = tx.type ?? "";
	if (t === "charge") return "Card payment";
	if (t === "payment") return "Card payment";
	if (t === "refund" || t === "payment_refund") return "Refund";
	if (t === "stripe_fee") return "Stripe fee";
	if (t === "application_fee") return "Stripe application fee";
	if (t === "application_fee_refund") return "Stripe application fee refund";
	if (t === "payout") return "Payout to bank";
	if (t === "payout_failure") return "Payout failure";
	if (t === "transfer") return "Stripe transfer";
	if (t === "adjustment") return "Adjustment";
	return tx.description || `Stripe ${t || "transaction"}`;
}
