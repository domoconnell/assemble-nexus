/**
 * Square-as-a-bank-account provider plugin.
 *
 * Square is structurally the same shape as Stripe in this system: it
 * holds funds between a card swipe in the café / event and the payout
 * to Monzo. We surface it as a bank account so:
 *
 *   - individual payments show up in the ledger (one IN per charge,
 *     one OUT per processing fee),
 *   - payouts to Monzo land as an OUT here and pair with the matching
 *     Monzo deposit via the sync's transfer detector, so totals don't
 *     double-count,
 *   - the dashboard sees the in-flight Square balance like any other
 *     account.
 *
 * Auth: Square access token (Production or Sandbox). Tokens are issued
 * from the Square Developer dashboard; they're a single long string,
 * stored in `bank_account.credentials.access_token`.
 *
 * Credentials shape:
 *   {
 *     access_token: string,
 *     location_id?: string,   // resolved at save time from /v2/locations
 *     base_url?: string,      // "https://connect.squareup.com" (default)
 *                             // or sandbox variant
 *   }
 *
 * Currency: GBP only, same as Stripe.
 */

const PRODUCTION_BASE = "https://connect.squareup.com";
const SANDBOX_BASE = "https://connect.squareupsandbox.com";
const SQUARE_VERSION = "2024-09-19";
const HOME_CURRENCY = "GBP";

function resolveBase(creds) {
	const explicit = creds?.base_url?.trim();
	if (explicit) return explicit.replace(/\/$/, "");
	// Sandbox tokens start with `EAAAEjs…` (sandbox prefix). In practice
	// the safest tell is the token prefix; defaulting to production keeps
	// existing setups working without ceremony.
	const tok = creds?.access_token ?? "";
	return tok.startsWith("EAAAlxq")
		? SANDBOX_BASE
		: PRODUCTION_BASE;
}

async function squareFetch(creds, path) {
	const base = resolveBase(creds);
	const res = await fetch(`${base}/v2${path}`, {
		headers: {
			Authorization: `Bearer ${creds.access_token}`,
			"Square-Version": SQUARE_VERSION,
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
		const sqErr = json?.errors?.[0];
		return {
			ok: false,
			status: res.status,
			error:
				sqErr?.detail ||
				sqErr?.code ||
				`Square ${res.status}: ${text.slice(0, 200)}`,
		};
	}
	return { ok: true, body: json };
}

export const squareBankProvider = {
	key: "square",
	label: "Square balance",
	helpUrl: "https://developer.squareup.com/apps",

	async probe(account) {
		const creds = account.credentials ?? {};
		if (!creds.access_token) {
			return { ok: false, error: "Paste a Square access token first." };
		}
		const res = await squareFetch(creds, "/locations");
		if (!res.ok) {
			return {
				ok: false,
				status: res.status,
				error:
					res.status === 401
						? "Square rejected the access token."
						: res.error,
			};
		}
		const locs = res.body?.locations ?? [];
		const active = locs.find((l) => l.status === "ACTIVE") ?? locs[0];
		if (!active) {
			return {
				ok: false,
				error: "No Square locations found on this merchant account.",
			};
		}
		return {
			ok: true,
			currency: HOME_CURRENCY,
			account_label: active.name ?? null,
			// cleared_minor: probe doesn't compute balance — that runs on sync.
			cleared_minor: 0,
			external_account_uid: active.id ?? null,
		};
	},

	async fetchBalance(account) {
		// Square's Connect API has no single "balance" endpoint. We
		// approximate it as: completed payments in the recent window minus
		// processing fees minus payouts in the same window. Good enough
		// for the dashboard line; the per-transaction view is the truth.
		const creds = account.credentials ?? {};
		if (!creds.access_token) {
			return { ok: false, error: "Missing Square access token." };
		}
		const now = new Date();
		const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

		const txRes = await squareBankProvider.listTransactions(account, { from, to: now });
		if (!txRes.ok) return txRes;

		let cleared = 0;
		for (const t of txRes.items) {
			if ((t.currency || HOME_CURRENCY).toUpperCase() !== HOME_CURRENCY) continue;
			cleared += t.direction === "IN" ? t.amount_minor : -t.amount_minor;
		}
		return {
			ok: true,
			cleared_minor: cleared,
			effective_minor: cleared,
			pending_minor: 0,
			currency: HOME_CURRENCY,
		};
	},

	async listTransactions(account, { from, to }) {
		const creds = account.credentials ?? {};
		if (!creds.access_token) {
			return { ok: false, error: "Missing Square access token." };
		}

		const fromIso = from.toISOString();
		const toIso = to.toISOString();
		const items = [];

		// 1. Payments (the individual customer charges)
		const paymentsRes = await collectPayments(creds, { fromIso, toIso });
		if (!paymentsRes.ok) return paymentsRes;
		for (const p of paymentsRes.items) {
			if ((p.amount_money?.currency || HOME_CURRENCY).toUpperCase() !== HOME_CURRENCY) continue;
			if (p.status !== "COMPLETED") continue;
			items.push(mapPayment(p));
			// Synthesise a separate OUT for the processing fee so the
			// ledger shows the fee as its own line, mirroring Stripe.
			const fee = sumFees(p.processing_fee);
			if (fee > 0) items.push(mapPaymentFee(p, fee));
		}

		// 2. Refunds (cardholder refunds — emit as OUT here)
		const refundsRes = await collectRefunds(creds, { fromIso, toIso });
		if (!refundsRes.ok) return refundsRes;
		for (const r of refundsRes.items) {
			if ((r.amount_money?.currency || HOME_CURRENCY).toUpperCase() !== HOME_CURRENCY) continue;
			if (r.status !== "COMPLETED") continue;
			items.push(mapRefund(r));
		}

		// 3. Payouts (Square -> Monzo; OUT here, paired with the Monzo IN
		//    by sync's transfer detector via amount + time proximity).
		const payoutsRes = await collectPayouts(creds, { fromIso, toIso });
		if (!payoutsRes.ok) return payoutsRes;
		for (const po of payoutsRes.items) {
			if ((po.amount_money?.currency || HOME_CURRENCY).toUpperCase() !== HOME_CURRENCY) continue;
			if (po.status !== "PAID" && po.status !== "SENT") continue;
			items.push(mapPayout(po));
		}

		return { ok: true, items };
	},
};

async function collectPaginated(creds, path) {
	const all = [];
	let cursor = null;
	let safety = 0;
	while (safety++ < 50) {
		const url = cursor ? `${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}` : path;
		const res = await squareFetch(creds, url);
		if (!res.ok) return res;
		all.push(res.body);
		cursor = res.body?.cursor ?? null;
		if (!cursor) break;
	}
	return { ok: true, batches: all };
}

async function collectPayments(creds, { fromIso, toIso }) {
	const path = `/payments?begin_time=${encodeURIComponent(fromIso)}&end_time=${encodeURIComponent(toIso)}&sort_order=ASC&limit=100`;
	const res = await collectPaginated(creds, path);
	if (!res.ok) return res;
	const items = res.batches.flatMap((b) => b?.payments ?? []);
	return { ok: true, items };
}

async function collectRefunds(creds, { fromIso, toIso }) {
	const path = `/refunds?begin_time=${encodeURIComponent(fromIso)}&end_time=${encodeURIComponent(toIso)}&sort_order=ASC&limit=100`;
	const res = await collectPaginated(creds, path);
	if (!res.ok) return res;
	const items = res.batches.flatMap((b) => b?.refunds ?? []);
	return { ok: true, items };
}

async function collectPayouts(creds, { fromIso, toIso }) {
	const locationId = creds.location_id;
	const params = new URLSearchParams({
		begin_time: fromIso,
		end_time: toIso,
		sort_order: "ASC",
		limit: "100",
	});
	if (locationId) params.set("location_id", locationId);
	const path = `/payouts?${params.toString()}`;
	const res = await collectPaginated(creds, path);
	if (!res.ok) return res;
	const items = res.batches.flatMap((b) => b?.payouts ?? []);
	return { ok: true, items };
}

function sumFees(processingFees) {
	if (!Array.isArray(processingFees)) return 0;
	let total = 0;
	for (const f of processingFees) {
		const amt = Number(f?.amount_money?.amount ?? 0);
		if (Number.isFinite(amt) && amt > 0) total += amt;
	}
	return total;
}

function mapPayment(p) {
	const amount = Number(p.amount_money?.amount ?? 0);
	const tMs = p.created_at ? Date.parse(p.created_at) : null;
	const settledMs = p.updated_at ? Date.parse(p.updated_at) : tMs;
	const cardholder =
		p.card_details?.card?.cardholder_name?.trim() ||
		p.shipping_address?.first_name ||
		null;
	const ref =
		p.note ||
		p.reference_id ||
		p.order_id ||
		null;
	return {
		external_id: p.id,
		direction: "IN",
		amount_minor: Math.abs(amount),
		currency: (p.amount_money?.currency || HOME_CURRENCY).toUpperCase(),
		counterparty_name: cardholder || "Square payment",
		counterparty_account: null,
		reference: ref,
		category_uid: "payment",
		settled_at: settledMs ? new Date(settledMs) : null,
		transaction_time: tMs ? new Date(tMs) : null,
		raw_payload: p,
	};
}

function mapPaymentFee(p, fee) {
	const tMs = p.created_at ? Date.parse(p.created_at) : null;
	const settledMs = p.updated_at ? Date.parse(p.updated_at) : tMs;
	return {
		external_id: `${p.id}#fee`,
		direction: "OUT",
		amount_minor: Math.abs(fee),
		currency: (p.amount_money?.currency || HOME_CURRENCY).toUpperCase(),
		counterparty_name: "Square processing fee",
		counterparty_account: null,
		reference: p.id,
		category_uid: "square_fee",
		settled_at: settledMs ? new Date(settledMs) : null,
		transaction_time: tMs ? new Date(tMs) : null,
		raw_payload: { synthetic_for: p.id, fee_details: p.processing_fee ?? null },
	};
}

function mapRefund(r) {
	const amount = Number(r.amount_money?.amount ?? 0);
	const tMs = r.created_at ? Date.parse(r.created_at) : null;
	const settledMs = r.updated_at ? Date.parse(r.updated_at) : tMs;
	return {
		external_id: r.id,
		direction: "OUT",
		amount_minor: Math.abs(amount),
		currency: (r.amount_money?.currency || HOME_CURRENCY).toUpperCase(),
		counterparty_name: r.reason || "Square refund",
		counterparty_account: null,
		reference: r.payment_id ?? r.id,
		category_uid: "refund",
		settled_at: settledMs ? new Date(settledMs) : null,
		transaction_time: tMs ? new Date(tMs) : null,
		raw_payload: r,
	};
}

function mapPayout(po) {
	const amount = Number(po.amount_money?.amount ?? 0);
	const tMs = po.created_at ? Date.parse(po.created_at) : null;
	const settledMs = po.arrival_date
		? Date.parse(po.arrival_date)
		: po.updated_at
			? Date.parse(po.updated_at)
			: tMs;
	return {
		external_id: po.id,
		direction: "OUT",
		amount_minor: Math.abs(amount),
		currency: (po.amount_money?.currency || HOME_CURRENCY).toUpperCase(),
		counterparty_name: "Square payout",
		// Tag with a stable counterparty so the sync's L1 transfer dedup
		// can match alongside the L2 amount+time pairing.
		counterparty_account: "square_payout",
		reference: po.id,
		category_uid: "payout",
		settled_at: settledMs ? new Date(settledMs) : null,
		transaction_time: tMs ? new Date(tMs) : null,
		raw_payload: po,
	};
}
