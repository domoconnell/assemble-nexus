import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { event } from "@/db/schema/entities/event.js";
import { ticket_type } from "@/db/schema/entities/ticket_type.js";
import { ticket_addon } from "@/db/schema/entities/ticket_addon.js";
import { ticket_type_addon } from "@/db/schema/entities/ticket_type_addon.js";
import { ticket_bundle } from "@/db/schema/entities/ticket_bundle.js";
import { ticket_bundle_item } from "@/db/schema/entities/ticket_bundle_item.js";
import { ticket_discount } from "@/db/schema/entities/ticket_discount.js";
import { ticket_discount_type } from "@/db/schema/entities/ticket_discount_type.js";
import { vat_rate } from "@/db/schema/entities/vat_rate.js";
import { event_organiser } from "@/db/schema/entities/event_organiser.js";
import { getCommittedOccupancy } from "@/db/queries/events.js";
import { getTicketingSettings } from "@/db/queries/settings.js";

function notDeleted(t) {
	return isNull(t.deletedAt);
}

async function loadEventCatalogue(eventId) {
	const [eventRow] = await db.select().from(event).where(eq(event.id, eventId)).limit(1);
	if (!eventRow) return null;

	const [types, addons, typeAddonLinks, bundles, bundleItems, discounts, discountTypes, vatRates, organiserRow, ticketingSettings] =
		await Promise.all([
			db
				.select()
				.from(ticket_type)
				.where(and(eq(ticket_type.event_id, eventId), notDeleted(ticket_type), eq(ticket_type.is_active, true))),
			db
				.select()
				.from(ticket_addon)
				.where(and(eq(ticket_addon.event_id, eventId), notDeleted(ticket_addon), eq(ticket_addon.is_active, true))),
			db
				.select()
				.from(ticket_type_addon)
				.innerJoin(ticket_addon, eq(ticket_type_addon.addon_id, ticket_addon.id))
				.where(eq(ticket_addon.event_id, eventId))
				.then((rows) =>
					rows.map((r) => ({
						ticket_type_id: r.ticket_type_addon.ticket_type_id,
						addon_id: r.ticket_type_addon.addon_id,
					})),
				),
			db
				.select()
				.from(ticket_bundle)
				.where(and(eq(ticket_bundle.event_id, eventId), notDeleted(ticket_bundle), eq(ticket_bundle.is_active, true))),
			db
				.select()
				.from(ticket_bundle_item)
				.innerJoin(ticket_bundle, eq(ticket_bundle_item.bundle_id, ticket_bundle.id))
				.where(eq(ticket_bundle.event_id, eventId))
				.then((rows) =>
					rows.map((r) => ({
						bundle_id: r.ticket_bundle_item.bundle_id,
						ticket_type_id: r.ticket_bundle_item.ticket_type_id,
						quantity: r.ticket_bundle_item.quantity,
					})),
				),
			db
				.select()
				.from(ticket_discount)
				.where(and(eq(ticket_discount.event_id, eventId), notDeleted(ticket_discount), eq(ticket_discount.is_active, true))),
			db.select().from(ticket_discount_type),
			db.select().from(vat_rate).where(notDeleted(vat_rate)),
			eventRow.event_organiser_id
				? db.select().from(event_organiser).where(eq(event_organiser.id, eventRow.event_organiser_id)).limit(1).then((r) => r[0] ?? null)
				: Promise.resolve(null),
			getTicketingSettings(eventRow.venue_id),
		]);

	return {
		event: eventRow,
		types,
		addons,
		typeAddonLinks,
		bundles,
		bundleItems,
		discounts,
		discountTypes,
		vatRates,
		organiser: organiserRow,
		ticketingSettings,
	};
}

function vatPercentFor(vatRateId, vatRates) {
	if (!vatRateId) return 0;
	const row = vatRates.find((v) => v.id === vatRateId);
	return row?.percent_x100 ?? 0;
}

function computeVat({ grossOrNet, vatPercent, vatInclusive }) {
	if (vatInclusive && vatPercent > 0) {
		const subtotal = Math.round((grossOrNet * 10000) / (10000 + vatPercent));
		return { subtotal, vat: grossOrNet - subtotal };
	}
	return {
		subtotal: grossOrNet,
		vat: Math.round((grossOrNet * vatPercent) / 10000),
	};
}

/**
 * Greedy bundle matching: iterate bundles in sort_order; for each, consume from
 * the remaining ticket buckets as many times as possible.
 */
function matchBundles({ bundles, bundleItems, buckets }) {
	const applied = [];
	const itemsByBundle = new Map();
	for (const it of bundleItems) {
		if (!itemsByBundle.has(it.bundle_id)) itemsByBundle.set(it.bundle_id, []);
		itemsByBundle.get(it.bundle_id).push(it);
	}

	for (const b of bundles) {
		const items = itemsByBundle.get(b.id) ?? [];
		if (!items.length) continue;
		while (items.every((it) => (buckets.get(it.ticket_type_id) ?? 0) >= it.quantity)) {
			for (const it of items) {
				buckets.set(it.ticket_type_id, (buckets.get(it.ticket_type_id) ?? 0) - it.quantity);
			}
			applied.push({ bundle: b, items });
		}
	}
	return applied;
}

function discountAppliesTo(discount, types) {
	const scoped = discount.ticket_type_ids;
	if (!scoped || scoped.length === 0) return new Set(types.map((t) => t.id));
	return new Set(scoped);
}

function withinDateWindow(d, now) {
	if (d.starts_at && new Date(d.starts_at) > now) return false;
	if (d.ends_at && new Date(d.ends_at) < now) return false;
	return true;
}

function applyAutoDiscounts({ discounts, typeIdToLines, types, now }) {
	const result = [];
	for (const d of discounts) {
		if (d.trigger !== "auto") continue;
		if (!withinDateWindow(d, now)) continue;
		const computed = computeDiscount(d, typeIdToLines, types);
		if (computed) result.push(computed);
	}
	return result;
}

function applyCodeDiscounts({ discounts, codes, typeIdToLines, types, now }) {
	const result = [];
	if (!codes?.length) return result;
	const upper = new Set(codes.map((c) => c.toUpperCase()));
	for (const d of discounts) {
		if (d.trigger !== "code") continue;
		if (!d.code || !upper.has(d.code.toUpperCase())) continue;
		if (!withinDateWindow(d, now)) continue;
		const computed = computeDiscount(d, typeIdToLines, types);
		if (computed) result.push(computed);
	}
	return result;
}

function computeDiscount(discount, typeIdToLines, types) {
	const ttIds = discountAppliesTo({ ...discount, ticket_type_ids: discount.ticket_type_ids }, types);
	const applicableLines = [];
	for (const [typeId, lines] of typeIdToLines.entries()) {
		if (ttIds.has(typeId)) applicableLines.push(...lines);
	}
	const applicableQty = applicableLines.reduce((s, l) => s + l.quantity, 0);
	if (discount.min_qty != null && applicableQty < discount.min_qty) return null;
	if (applicableQty <= 0) return null;

	const applicableSubtotal = applicableLines.reduce((s, l) => s + l.line_total_cents, 0);

	let amount_cents = 0;
	if (discount.kind === "percent" && discount.value_x100 != null) {
		amount_cents = Math.round((applicableSubtotal * discount.value_x100) / 10000);
	} else if (discount.kind === "fixed_cents" && discount.value_cents != null) {
		amount_cents = Math.min(discount.value_cents, applicableSubtotal);
	} else if (discount.kind === "nth_free" && discount.n_free) {
		// Every Nth ticket free: floor(qty / N) free units, valued at the cheapest applicable unit price.
		const freeCount = Math.floor(applicableQty / discount.n_free);
		if (freeCount > 0) {
			const cheapest = applicableLines.reduce((min, l) => Math.min(min, l.unit_price_cents), Infinity);
			if (Number.isFinite(cheapest)) {
				amount_cents = freeCount * cheapest;
			}
		}
	}

	if (amount_cents <= 0) return null;
	return {
		discount_id: discount.id,
		label: discount.label,
		kind: discount.kind,
		amount_cents,
	};
}

/**
 * Booking-fee math.
 *
 * fee_on(A) = round(A × pct + flat)
 *
 * - If organiser absorbs: customer pays `orderValue`; fee comes out of organiser revenue.
 *     organiserReceives = orderValue − fee_on(orderValue)
 * - If customer covers: customer pays a higher total T such that T − fee_on(T) = orderValue:
 *     T = ceil((orderValue + flat) / (1 − pct))   (pct < 1)
 *     fee_added = T − orderValue
 *     organiserReceives = orderValue (whole)
 */
function feeOn(amount_cents, settings) {
	const pctX100 = settings?.platform_fee_pct_x100 ?? 0;
	const flat = settings?.platform_fee_flat_cents ?? 0;
	if (amount_cents <= 0) return 0;
	return Math.round((amount_cents * pctX100) / 10000) + flat;
}

function customerCoversFeeAmount(orderValue_cents, settings) {
	const pctX100 = settings?.platform_fee_pct_x100 ?? 0;
	const flat = settings?.platform_fee_flat_cents ?? 0;
	if (orderValue_cents <= 0) return { customer_total: 0, fee_added: 0 };
	// pctX100 is "percent × 100", so 200 = 2%. Convert: divisor = (10000 - pctX100) / 10000.
	const denom = 10000 - pctX100;
	if (denom <= 0) return { customer_total: orderValue_cents, fee_added: 0 };
	const customer_total = Math.ceil(((orderValue_cents + flat) * 10000) / denom);
	return { customer_total, fee_added: customer_total - orderValue_cents };
}

/**
 * Quote a ticket cart.
 *
 * cart shape:
 *   {
 *     tickets: [
 *       { ticket_type_id, quantity, addons?: [{ addon_id, quantity }] }
 *     ]
 *   }
 *
 * codes: optional array of discount codes the customer entered.
 */
export async function quoteTicketOrder({ eventId, cart, codes = [], customerCoversFeeOptIn = false }) {
	const catalogue = await loadEventCatalogue(eventId);
	if (!catalogue) return { error: "Event not found." };
	const { event: ev, types, addons, typeAddonLinks, bundles, bundleItems, discounts, discountTypes, vatRates, organiser, ticketingSettings } = catalogue;

	const typeById = new Map(types.map((t) => [t.id, t]));
	const addonById = new Map(addons.map((a) => [a.id, a]));

	// Validate addon attachment per ticket type
	const allowedAddonByType = new Map();
	for (const link of typeAddonLinks) {
		if (!allowedAddonByType.has(link.ticket_type_id)) allowedAddonByType.set(link.ticket_type_id, new Set());
		allowedAddonByType.get(link.ticket_type_id).add(link.addon_id);
	}

	// Hydrate discount scopes
	const dtByDiscount = new Map();
	for (const link of discountTypes) {
		if (!dtByDiscount.has(link.discount_id)) dtByDiscount.set(link.discount_id, []);
		dtByDiscount.get(link.discount_id).push(link.ticket_type_id);
	}
	const discountsHydrated = discounts.map((d) => ({
		...d,
		ticket_type_ids: dtByDiscount.get(d.id) ?? [],
	}));

	const lines = [];
	const typeIdToLines = new Map();

	// Build ticket + addon lines
	for (let i = 0; i < cart.tickets.length; i++) {
		const entry = cart.tickets[i];
		const tt = typeById.get(entry.ticket_type_id);
		if (!tt) return { error: `Unknown ticket type: ${entry.ticket_type_id}` };
		const qty = Math.max(1, Math.round(Number(entry.quantity) || 0));

		const vatPct = vatPercentFor(tt.vat_rate_id, vatRates);
		const gross = tt.price_cents * qty;
		const { subtotal, vat } = computeVat({
			grossOrNet: gross,
			vatPercent: vatPct,
			vatInclusive: tt.vat_inclusive,
		});

		const ticketLine = {
			kind: "ticket",
			cart_index: i,
			ticket_type_id: tt.id,
			name_snapshot: tt.name,
			quantity: qty,
			unit_price_cents: tt.price_cents,
			vat_rate_x100_snapshot: vatPct,
			vat_inclusive_snapshot: tt.vat_inclusive,
			vat_cents: vat,
			line_total_cents: subtotal,
			admits_count: tt.admits_count,
		};
		lines.push(ticketLine);
		if (!typeIdToLines.has(tt.id)) typeIdToLines.set(tt.id, []);
		typeIdToLines.get(tt.id).push(ticketLine);

		if (entry.addons?.length) {
			const allowed = allowedAddonByType.get(tt.id) ?? new Set();
			for (const a of entry.addons) {
				if (!allowed.has(a.addon_id)) continue;
				const addon = addonById.get(a.addon_id);
				if (!addon) continue;
				// addon.quantity is the TOTAL count across the ticket line — i.e. how
				// many of the line's tickets are getting this addon. Capped at
				// (ticket_qty × max_per_ticket).
				const maxPerTicket = addon.max_quantity_per_ticket ?? 1;
				const totalQty = Math.min(
					Math.max(0, Math.round(Number(a.quantity) || 0)),
					qty * maxPerTicket,
				);
				if (totalQty <= 0) continue;
				const aGross = addon.price_cents * totalQty;
				const aVatPct = vatPercentFor(addon.vat_rate_id, vatRates);
				const { subtotal: aSub, vat: aVat } = computeVat({
					grossOrNet: aGross,
					vatPercent: aVatPct,
					vatInclusive: addon.vat_inclusive,
				});
				lines.push({
					kind: "addon",
					parent_cart_index: i,
					addon_id: addon.id,
					name_snapshot: addon.name,
					quantity: totalQty,
					unit_price_cents: addon.price_cents,
					vat_rate_x100_snapshot: aVatPct,
					vat_inclusive_snapshot: addon.vat_inclusive,
					vat_cents: aVat,
					line_total_cents: aSub,
				});
			}
		}
	}

	// Bundle matching: build buckets, try bundles, emit bundle adjustments
	const buckets = new Map();
	for (const [typeId, ls] of typeIdToLines.entries()) {
		buckets.set(typeId, ls.reduce((s, l) => s + l.quantity, 0));
	}
	const bundleApplications = matchBundles({ bundles, bundleItems, buckets });
	const bundleLines = [];
	for (const { bundle, items } of bundleApplications) {
		// Compute sum-of-parts for the bundle (using ticket types' unit prices)
		const sumOfParts = items.reduce((s, it) => {
			const tt = typeById.get(it.ticket_type_id);
			return s + (tt ? tt.price_cents * it.quantity : 0);
		}, 0);
		const bVatPct = vatPercentFor(bundle.vat_rate_id, vatRates);
		const { subtotal: bSub, vat: bVat } = computeVat({
			grossOrNet: bundle.total_price_cents,
			vatPercent: bVatPct,
			vatInclusive: bundle.vat_inclusive,
		});
		bundleLines.push({
			kind: "bundle",
			bundle_id: bundle.id,
			name_snapshot: bundle.name,
			quantity: 1,
			unit_price_cents: bundle.total_price_cents,
			vat_rate_x100_snapshot: bVatPct,
			vat_inclusive_snapshot: bundle.vat_inclusive,
			vat_cents: bVat,
			line_total_cents: bSub,
			savings_cents: Math.max(0, sumOfParts - bundle.total_price_cents),
			items: items.map((it) => ({ ticket_type_id: it.ticket_type_id, quantity: it.quantity })),
		});
	}

	// Bundle-consumed ticket quantities need to be removed from the priced ticket lines
	// so discounts/totals don't double-count.
	const consumedByType = new Map();
	for (const { items } of bundleApplications) {
		for (const it of items) {
			consumedByType.set(it.ticket_type_id, (consumedByType.get(it.ticket_type_id) ?? 0) + it.quantity);
		}
	}
	const remainingTicketLines = [];
	const remainingByType = new Map();
	for (const line of lines) {
		if (line.kind !== "ticket") continue;
		let consumed = consumedByType.get(line.ticket_type_id) ?? 0;
		const remainingQty = Math.max(0, line.quantity - consumed);
		consumedByType.set(line.ticket_type_id, Math.max(0, consumed - line.quantity));
		if (remainingQty > 0) {
			const factor = remainingQty / line.quantity;
			const newSubtotal = Math.round(line.line_total_cents * factor);
			const newVat = Math.round(line.vat_cents * factor);
			const newLine = {
				...line,
				quantity: remainingQty,
				line_total_cents: newSubtotal,
				vat_cents: newVat,
			};
			remainingTicketLines.push(newLine);
			if (!remainingByType.has(line.ticket_type_id)) remainingByType.set(line.ticket_type_id, []);
			remainingByType.get(line.ticket_type_id).push(newLine);
		}
	}

	// Compute discounts against remaining ticket lines (post-bundle)
	const now = new Date();
	const autoDiscounts = applyAutoDiscounts({ discounts: discountsHydrated, typeIdToLines: remainingByType, types, now });
	const codeDiscounts = applyCodeDiscounts({ discounts: discountsHydrated, codes, typeIdToLines: remainingByType, types, now });
	const discountLines = [...autoDiscounts, ...codeDiscounts].map((d) => ({
		kind: "discount",
		discount_id: d.discount_id,
		name_snapshot: d.label,
		quantity: 1,
		unit_price_cents: -d.amount_cents,
		vat_rate_x100_snapshot: 0,
		vat_inclusive_snapshot: false,
		vat_cents: 0,
		line_total_cents: -d.amount_cents,
	}));

	// Replace original ticket lines with bundle-adjusted versions
	const ticketLinesRemainOnly = lines.filter((l) => l.kind === "ticket");
	const addonLines = lines.filter((l) => l.kind === "addon");
	const finalTicketLines = remainingTicketLines;

	const allLines = [
		...finalTicketLines,
		...bundleLines,
		...addonLines,
		...discountLines,
	];

	// Totals
	let subtotal_cents = 0;
	let vat_cents = 0;
	let discount_cents = 0;
	for (const l of allLines) {
		if (l.kind === "discount") discount_cents += l.line_total_cents; // negative
		else {
			subtotal_cents += l.line_total_cents;
			vat_cents += l.vat_cents;
		}
	}
	subtotal_cents += discount_cents; // discount_cents is negative
	const total_cents = subtotal_cents + vat_cents;

	// Occupancy: include bundled tickets via their ticket_type admits_count
	let occupancy_used_this_quote = 0;
	for (const l of ticketLinesRemainOnly) {
		occupancy_used_this_quote += l.quantity * (l.admits_count ?? 1);
	}
	const committed = await getCommittedOccupancy(eventId);
	const max = ev.max_occupancy ?? null;
	const total_committed_if_paid = committed + occupancy_used_this_quote;
	const over_capacity = max != null && total_committed_if_paid > max;
	const available = max != null ? Math.max(0, max - committed) : null;

	// Booking-fee math. orderValue is what the organiser is to receive (subtotal post-discount).
	// Fee is charged on (subtotal + vat) — Stripe-style fee-on-gross.
	const orderValue_cents = subtotal_cents + vat_cents;
	const customerPays = !!ev.fee_pass_through || !!customerCoversFeeOptIn;
	const allow_customer_optin = !ev.fee_pass_through; // org absorbs by default ⇒ allow opt-in

	// Compute both modes so the UI can show "if you opt in, you'd pay £X" upfront.
	let fee_if_organiser_pays_cents = 0;
	let fee_if_customer_pays_cents = 0;
	if (orderValue_cents > 0 && ticketingSettings) {
		fee_if_organiser_pays_cents = feeOn(orderValue_cents, ticketingSettings);
		const inverse = customerCoversFeeAmount(orderValue_cents, ticketingSettings);
		fee_if_customer_pays_cents = inverse.fee_added;
	}

	let booking_fee_cents = 0;
	let customer_total_cents = orderValue_cents;
	let organiser_receives_cents = orderValue_cents;

	if (orderValue_cents > 0 && ticketingSettings) {
		if (customerPays) {
			booking_fee_cents = fee_if_customer_pays_cents;
			customer_total_cents = orderValue_cents + fee_if_customer_pays_cents;
			organiser_receives_cents = orderValue_cents;
		} else {
			booking_fee_cents = fee_if_organiser_pays_cents;
			organiser_receives_cents = orderValue_cents - fee_if_organiser_pays_cents;
			customer_total_cents = orderValue_cents;
		}
	}

	return {
		event_id: eventId,
		lines: allLines,
		subtotal_cents,
		vat_cents,
		discount_cents,
		total_cents,
		customer_total_cents,
		booking_fee: {
			cents: booking_fee_cents,
			borne_by: customerPays ? "customer" : "organiser",
			pass_through_default: !!ev.fee_pass_through,
			allow_customer_optin,
			fee_if_organiser_pays_cents,
			fee_if_customer_pays_cents,
			pct_x100: ticketingSettings?.platform_fee_pct_x100 ?? 0,
			flat_cents: ticketingSettings?.platform_fee_flat_cents ?? 0,
		},
		organiser: organiser
			? { id: organiser.id, name: organiser.name }
			: null,
		organiser_receives_cents,
		bundles_applied: bundleApplications.map(({ bundle, items }) => ({
			bundle_id: bundle.id,
			name: bundle.name,
			items,
		})),
		occupancy: {
			max,
			committed_existing: committed,
			used_this_quote: occupancy_used_this_quote,
			total_committed_if_paid,
			available,
			over_capacity,
		},
	};
}
