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
				items.push(mapBalanceTransaction(tx));
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
	const friendlyDescription = describeStripeType(tx);

	return {
		external_id: tx.id,
		direction,
		amount_minor: Math.abs(amount),
		currency: (tx.currency || HOME_CURRENCY).toUpperCase(),
		counterparty_name: friendlyDescription,
		// Stripe doesn't expose the destination bank account directly on
		// balance_transactions - we use the type as a discriminator so the
		// sync layer can spot payouts later.
		counterparty_account: tx.type === "payout" ? "stripe_payout" : null,
		reference: tx.description ?? null,
		category_uid: tx.type ?? null,
		settled_at: settledMs ? new Date(settledMs) : null,
		transaction_time: createdMs ? new Date(createdMs) : null,
		raw_payload: tx,
	};
}

function describeStripeType(tx) {
	const t = tx.type ?? "";
	if (t === "charge") return "Stripe charge";
	if (t === "payment") return "Stripe payment";
	if (t === "refund" || t === "payment_refund") return "Stripe refund";
	if (t === "stripe_fee") return "Stripe fee";
	if (t === "application_fee") return "Stripe application fee";
	if (t === "application_fee_refund") return "Stripe application fee refund";
	if (t === "payout") return "Stripe payout to bank";
	if (t === "payout_failure") return "Stripe payout failure";
	if (t === "transfer") return "Stripe transfer";
	if (t === "adjustment") return "Stripe adjustment";
	return tx.description || `Stripe ${t || "transaction"}`;
}
