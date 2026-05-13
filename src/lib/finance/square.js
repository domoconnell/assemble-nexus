/**
 * Minimal Square REST client for daily-takings sync.
 *
 * Credentials live in the per-venue `square` setting (access_token, location_id,
 * environment). Legacy env-var values are honoured as a fallback so existing
 * deploys keep working until the new settings page is filled in.
 *
 * We deliberately avoid the SDK to keep deps lean — REST against the public
 * Orders / Payments / Refunds endpoints is enough.
 *
 * Square timestamps are RFC 3339 in UTC; we bucket per Europe/London date so a
 * 23:30 BST sale on the 31st lands in that day, not the UTC-next day.
 */

const ENV_BASE_URLS = {
	production: "https://connect.squareup.com",
	sandbox: "https://connect.squareupsandbox.com",
};

export function squareConfig(settings) {
	const token = settings?.access_token || process.env.SQUARE_ACCESS_TOKEN || null;
	const locationId = settings?.location_id || process.env.SQUARE_LOCATION_ID || null;
	const env = (
		settings?.environment ||
		process.env.SQUARE_ENVIRONMENT ||
		"sandbox"
	).toLowerCase();
	return {
		token,
		locationId,
		env,
		baseUrl: ENV_BASE_URLS[env] || ENV_BASE_URLS.sandbox,
		configured: !!(token && locationId),
	};
}

async function squareFetch(cfg, path, init = {}) {
	if (!cfg.configured) throw new Error("Square not configured");
	const res = await fetch(`${cfg.baseUrl}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${cfg.token}`,
			"Square-Version": "2025-06-18",
			"Content-Type": "application/json",
			...(init.headers || {}),
		},
		// Square API responses can be large; we deliberately don't cache.
		cache: "no-store",
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Square ${path} failed: ${res.status} ${body}`);
	}
	return res.json();
}

/**
 * Probe that the supplied credentials work — used by the settings page's
 * "Test connection" button. Calls /v2/locations/{id} which is a cheap
 * sanity check that doesn't pull large lists.
 */
export async function probeSquare(settings) {
	const cfg = squareConfig(settings);
	if (!cfg.configured) {
		return { ok: false, error: "Missing access token or location ID." };
	}
	try {
		const res = await fetch(`${cfg.baseUrl}/v2/locations/${cfg.locationId}`, {
			headers: {
				Authorization: `Bearer ${cfg.token}`,
				"Square-Version": "2025-06-18",
			},
			cache: "no-store",
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			return {
				ok: false,
				status: res.status,
				error:
					res.status === 401
						? "Square rejected the access token."
						: res.status === 404
							? "Location ID not found for this token."
							: `Square returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
			};
		}
		const data = await res.json();
		return {
			ok: true,
			location_name: data.location?.name ?? null,
			currency: data.location?.currency ?? "GBP",
			env: cfg.env,
		};
	} catch (err) {
		return { ok: false, error: err?.message || "Square probe failed" };
	}
}

const londonDateFmt = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Europe/London",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

function londonDateOf(iso) {
	return londonDateFmt.format(new Date(iso));
}

/**
 * Walk all orders in [startIso, endIso) for the configured location, returning
 * a normalised array of order summaries.
 */
async function fetchOrdersInRange(cfg, startIso, endIso) {
	const orders = [];
	let cursor = null;
	let safety = 0;
	do {
		const body = {
			location_ids: [cfg.locationId],
			query: {
				filter: {
					date_time_filter: {
						closed_at: { start_at: startIso, end_at: endIso },
					},
					state_filter: { states: ["COMPLETED"] },
				},
				sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
			},
			limit: 500,
			...(cursor ? { cursor } : {}),
		};
		const data = await squareFetch(cfg, "/v2/orders/search", {
			method: "POST",
			body: JSON.stringify(body),
		});
		for (const o of data.orders || []) {
			orders.push({
				id: o.id,
				closed_at: o.closed_at,
				total_money: o.total_money?.amount ?? 0,
				total_tax_money: o.total_tax_money?.amount ?? 0,
				total_discount_money: o.total_discount_money?.amount ?? 0,
				net_amount: o.net_amount_due_money?.amount ?? null,
				line_items: o.line_items || [],
				returns: o.returns || [],
			});
		}
		cursor = data.cursor || null;
		safety++;
		if (safety > 100) break;
	} while (cursor);
	return orders;
}

/**
 * Walk all refunds in the same window so refunds are netted out of gross.
 */
async function fetchRefundsInRange(cfg, startIso, endIso) {
	const refunds = [];
	let cursor = null;
	let safety = 0;
	do {
		const params = new URLSearchParams({
			location_id: cfg.locationId,
			begin_time: startIso,
			end_time: endIso,
			...(cursor ? { cursor } : {}),
		});
		const data = await squareFetch(cfg, `/v2/refunds?${params.toString()}`);
		for (const r of data.refunds || data.payment_refunds || []) {
			refunds.push({
				id: r.id,
				created_at: r.created_at,
				amount: r.amount_money?.amount ?? 0,
				status: r.status,
			});
		}
		cursor = data.cursor || null;
		safety++;
		if (safety > 100) break;
	} while (cursor);
	return refunds;
}

/**
 * Pull Square data for the given inclusive date range (London-local YMD
 * strings) and bucket it into one entry per day.
 *
 * Returns: Array<{ date, gross_cents, net_cents, vat_cents, cogs_cents,
 *                  transactions_count, category_breakdown }>
 *
 * gross  = sum(order.total_money) − sum(refund.amount)
 * vat    = sum(order.total_tax_money)
 * net    = gross − vat
 * cogs   = 0 in v1 (Catalog cost lookup added later)
 */
export async function syncSquareDailyTakings({ fromYmd, toYmd, settings }) {
	const cfg = squareConfig(settings);
	if (!cfg.configured) throw new Error("Square not configured");
	const startIso = new Date(`${fromYmd}T00:00:00.000Z`).toISOString();
	// One extra day on the end to safely cover late-evening UK transactions
	// that close after midnight UTC.
	const toPlusOne = nextYmd(toYmd, 2);
	const endIso = new Date(`${toPlusOne}T00:00:00.000Z`).toISOString();

	const [orders, refunds] = await Promise.all([
		fetchOrdersInRange(cfg, startIso, endIso),
		fetchRefundsInRange(cfg, startIso, endIso),
	]);

	const byDay = new Map();
	function bucket(ymd) {
		if (!byDay.has(ymd)) {
			byDay.set(ymd, {
				date: ymd,
				gross_cents: 0,
				net_cents: 0,
				vat_cents: 0,
				cogs_cents: 0,
				transactions_count: 0,
				category_breakdown: {},
			});
		}
		return byDay.get(ymd);
	}

	for (const o of orders) {
		if (!o.closed_at) continue;
		const ymd = londonDateOf(o.closed_at);
		if (ymd < fromYmd || ymd > toYmd) continue;
		const b = bucket(ymd);
		b.gross_cents += o.total_money;
		b.vat_cents += o.total_tax_money;
		b.transactions_count += 1;

		for (const li of o.line_items) {
			const amt = Number(li.total_money?.amount ?? 0);
			const cat = li.category_name || li.name || "Other";
			b.category_breakdown[cat] = (b.category_breakdown[cat] ?? 0) + amt;
		}
	}

	for (const r of refunds) {
		if (r.status !== "COMPLETED" && r.status !== "APPROVED") continue;
		const ymd = londonDateOf(r.created_at);
		if (ymd < fromYmd || ymd > toYmd) continue;
		const b = bucket(ymd);
		b.gross_cents -= r.amount;
	}

	for (const b of byDay.values()) {
		b.net_cents = b.gross_cents - b.vat_cents;
	}

	return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function nextYmd(ymd, days = 1) {
	const [y, m, d] = ymd.split("-").map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() + days);
	const pad = (n) => String(n).padStart(2, "0");
	return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
