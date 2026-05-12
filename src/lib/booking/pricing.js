import { and, desc, eq, inArray, isNull, lte, gte, or } from "drizzle-orm";
import { db } from "@/db/index.js";
import { pricing_rule } from "@/db/schema/entities/pricing_rule.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";
import { vat_rate } from "@/db/schema/entities/vat_rate.js";
import { facility_package } from "@/db/schema/entities/facility_package.js";
import { discount } from "@/db/schema/entities/discount.js";
import { room } from "@/db/schema/entities/room.js";
import { getHourlyBands } from "@/db/queries/settings.js";

async function findRule({ venueId, roomId, bookingTypeId, rateKind, at }) {
	const conditions = [
		eq(pricing_rule.venue_id, venueId),
		eq(pricing_rule.booking_type_id, bookingTypeId),
		eq(pricing_rule.rate_kind, rateKind),
		isNull(pricing_rule.deletedAt),
	];
	if (roomId === null) {
		conditions.push(isNull(pricing_rule.room_id));
	} else {
		conditions.push(eq(pricing_rule.room_id, roomId));
	}
	const atDate = at instanceof Date ? at : new Date(at);
	conditions.push(or(isNull(pricing_rule.applies_from), lte(pricing_rule.applies_from, atDate)));
	conditions.push(or(isNull(pricing_rule.applies_to), gte(pricing_rule.applies_to, atDate)));

	const [rule] = await db
		.select()
		.from(pricing_rule)
		.where(and(...conditions))
		.orderBy(desc(pricing_rule.applies_from), desc(pricing_rule.sort_order))
		.limit(1);
	return rule || null;
}

async function resolveRule({ venueId, roomId, bookingTypeId, eventTypeId, rateKind, at }) {
	let rule = await findRule({ venueId, roomId, bookingTypeId, rateKind, at });
	if (rule) return { rule, useTypeModifier: false };

	rule = await findRule({ venueId, roomId: null, bookingTypeId, rateKind, at });
	if (rule) return { rule, useTypeModifier: false };

	if (eventTypeId && bookingTypeId !== eventTypeId) {
		rule = await findRule({ venueId, roomId, bookingTypeId: eventTypeId, rateKind, at });
		if (rule) return { rule, useTypeModifier: true };

		rule = await findRule({ venueId, roomId: null, bookingTypeId: eventTypeId, rateKind, at });
		if (rule) return { rule, useTypeModifier: true };
	}

	return null;
}

function computeHours(startsAt, endsAt) {
	const ms = endsAt.getTime() - startsAt.getTime();
	return ms / (1000 * 60 * 60);
}

const venueTimeFmt = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/London",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

function venueHmm(date) {
	const parts = venueTimeFmt.formatToParts(date);
	const h = parts.find((p) => p.type === "hour")?.value ?? "00";
	const m = parts.find((p) => p.type === "minute")?.value ?? "00";
	return `${h}:${m}`;
}

function findBand(bands, hmm) {
	for (const b of bands) {
		if (hmm >= b.from && hmm < b.to) return b;
	}
	return null;
}

function bandWeightedHours(bands, startsAt, endsAt, slotMinutes = 15) {
	let weighted = 0;
	let unweighted = 0;
	const byBand = new Map();
	const startMs = startsAt.getTime();
	const endMs = endsAt.getTime();
	const slotMs = slotMinutes * 60 * 1000;
	for (let t = startMs; t < endMs; t += slotMs) {
		const hmm = venueHmm(new Date(t));
		const band = findBand(bands, hmm);
		const modifierX100 = band?.modifier_x100 ?? 10000;
		const label = band?.label ?? "Standard";
		const hoursInSlot = slotMinutes / 60;
		weighted += hoursInSlot * (modifierX100 / 10000);
		unweighted += hoursInSlot;
		const key = `${label}|${modifierX100}`;
		if (!byBand.has(key)) {
			byBand.set(key, { label, modifier_x100: modifierX100, hours: 0 });
		}
		byBand.get(key).hours += hoursInSlot;
	}
	return { weighted, unweighted, byBand };
}

async function getVatPercent(vatRateId) {
	if (!vatRateId) return 0;
	const [row] = await db.select().from(vat_rate).where(eq(vat_rate.id, vatRateId)).limit(1);
	return row?.percent_x100 ?? 0;
}

export async function priceSegment({ venueId, segment, eventTypeId, bookingTypeById, bands = null }) {
	const startsAt = new Date(segment.starts_at);
	const endsAt = new Date(segment.ends_at);

	if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf())) {
		return { error: "Invalid segment dates." };
	}

	const hours = computeHours(startsAt, endsAt);
	if (hours <= 0) {
		return { error: "End time must be after start time." };
	}

	const bookingType = bookingTypeById.get(segment.booking_type_id);
	if (!bookingType) return { error: "Unknown booking type." };

	const resolution = await resolveRule({
		venueId,
		roomId: segment.room_id,
		bookingTypeId: segment.booking_type_id,
		eventTypeId,
		rateKind: "hourly",
		at: startsAt,
	});

	if (!resolution) {
		return { error: "No pricing rule available for this room and booking type." };
	}

	const { rule, useTypeModifier } = resolution;
	const modifier_x100 = useTypeModifier ? bookingType.default_rate_modifier_x100 : 10000;

	const minHours = rule.min_hours ?? 0;
	let billedWeighted = hours;
	let usedBands = false;
	let bandBreakdown = null;
	if (bands && Array.isArray(bands.bands) && bands.bands.length > 0) {
		const { weighted, unweighted, byBand } = bandWeightedHours(bands.bands, startsAt, endsAt);
		billedWeighted = weighted;
		const minTopUp = unweighted < minHours ? minHours - unweighted : 0;
		if (minTopUp > 0) billedWeighted += minTopUp;
		usedBands = true;

		bandBreakdown = [];
		for (const info of byBand.values()) {
			const unit = Math.round(
				(rule.amount_cents * modifier_x100 * info.modifier_x100) / 100000000,
			);
			bandBreakdown.push({
				label: info.label,
				modifier_x100: info.modifier_x100,
				hours: info.hours,
				unit_price_cents: unit,
				total_cents: Math.round(unit * info.hours),
			});
		}
		if (minTopUp > 0) {
			const unit = Math.round((rule.amount_cents * modifier_x100) / 10000);
			bandBreakdown.push({
				label: "Minimum top-up",
				modifier_x100: 10000,
				hours: minTopUp,
				unit_price_cents: unit,
				total_cents: Math.round(unit * minTopUp),
				is_top_up: true,
			});
		}
	} else if (hours < minHours) {
		billedWeighted = minHours;
		const unit = Math.round((rule.amount_cents * modifier_x100) / 10000);
		bandBreakdown = [
			{
				label: "Hourly",
				modifier_x100: 10000,
				hours: minHours,
				unit_price_cents: unit,
				total_cents: Math.round(unit * minHours),
			},
		];
	} else {
		const unit = Math.round((rule.amount_cents * modifier_x100) / 10000);
		bandBreakdown = [
			{
				label: "Hourly",
				modifier_x100: 10000,
				hours,
				unit_price_cents: unit,
				total_cents: Math.round(unit * hours),
			},
		];
	}

	let grossOrNet = Math.round((rule.amount_cents * billedWeighted * modifier_x100) / 10000);

	let dailyCapApplied = false;
	let dailyCapCents = null;
	if (rule.daily_cap_cents != null && rule.daily_cap_cents > 0) {
		dailyCapCents = Math.round((rule.daily_cap_cents * modifier_x100) / 10000);
		if (grossOrNet > dailyCapCents) {
			grossOrNet = dailyCapCents;
			dailyCapApplied = true;
		}
	}

	const vatPercent = await getVatPercent(rule.vat_rate_id);

	let subtotal_cents;
	let vat_cents;
	if (rule.vat_inclusive && vatPercent > 0) {
		subtotal_cents = Math.round((grossOrNet * 10000) / (10000 + vatPercent));
		vat_cents = grossOrNet - subtotal_cents;
	} else {
		subtotal_cents = grossOrNet;
		vat_cents = Math.round((grossOrNet * vatPercent) / 10000);
	}

	return {
		rate_snapshot_kind: rule.rate_kind,
		rate_snapshot_amount_cents: rule.amount_cents,
		units_x100: Math.round(billedWeighted * 100),
		modifier_x100,
		vat_rate_snapshot_x100: vatPercent,
		vat_inclusive_snapshot: rule.vat_inclusive,
		computed_subtotal_cents: subtotal_cents,
		computed_vat_cents: vat_cents,
		actual_hours: hours,
		billed_hours: billedWeighted,
		min_hours_applied: minHours > 0 && hours < minHours,
		bands_applied: usedBands,
		daily_cap_cents: dailyCapCents,
		daily_cap_applied: dailyCapApplied,
		band_breakdown: bandBreakdown,
	};
}

async function priceFacilitySelection({ pkg, quantity }) {
	const qty = Math.max(1, Math.round(Number(quantity) || 1));
	const grossOrNet = (pkg.price_cents ?? 0) * qty;
	const vatPercent = await getVatPercent(pkg.vat_rate_id);

	let subtotal_cents;
	let vat_cents;
	if (pkg.vat_inclusive && vatPercent > 0) {
		subtotal_cents = Math.round((grossOrNet * 10000) / (10000 + vatPercent));
		vat_cents = grossOrNet - subtotal_cents;
	} else {
		subtotal_cents = grossOrNet;
		vat_cents = Math.round((grossOrNet * vatPercent) / 10000);
	}

	return {
		facility_package_id: pkg.id,
		name_snapshot: pkg.name,
		price_snapshot_cents: pkg.price_cents ?? 0,
		quantity: qty,
		vat_rate_snapshot_x100: vatPercent,
		vat_inclusive_snapshot: !!pkg.vat_inclusive,
		computed_subtotal_cents: subtotal_cents,
		computed_vat_cents: vat_cents,
	};
}

async function loadActiveDiscount({ venueId, discountId }) {
	if (!discountId) return null;
	const [row] = await db
		.select()
		.from(discount)
		.where(
			and(
				eq(discount.id, discountId),
				eq(discount.venue_id, venueId),
				eq(discount.is_active, true),
				isNull(discount.deletedAt),
			),
		)
		.limit(1);
	return row ?? null;
}

export async function priceQuote({
	venueId,
	segments,
	facilitySelections = [],
	discountId = null,
	ticketing = null,
}) {
	const [eventTypeRow] = await db
		.select()
		.from(booking_type)
		.where(eq(booking_type.key, "event"))
		.limit(1);
	const eventTypeId = eventTypeRow?.id ?? null;

	const allTypes = await db
		.select()
		.from(booking_type)
		.where(isNull(booking_type.deletedAt));
	const bookingTypeById = new Map(allTypes.map((t) => [t.id, t]));

	const bands = await getHourlyBands(venueId);

	const pricedSegments = [];
	let roomSubtotal = 0;
	let roomVat = 0;

	for (const seg of segments) {
		const priced = await priceSegment({ venueId, segment: seg, eventTypeId, bookingTypeById, bands });
		pricedSegments.push({ ...seg, ...priced });
		if (!priced.error) {
			roomSubtotal += priced.computed_subtotal_cents;
			roomVat += priced.computed_vat_cents;
		}
	}

	const discountRow = await loadActiveDiscount({ venueId, discountId });
	let discountAppliedTo = "room_hire";
	let discountSubtotalCents = 0;
	let discountVatCents = 0;
	if (discountRow) {
		discountAppliedTo = discountRow.applies_to ?? "room_hire";
		discountSubtotalCents = Math.round((roomSubtotal * discountRow.percent_x100) / 10000);
		discountVatCents = Math.round((roomVat * discountRow.percent_x100) / 10000);
	}
	const roomSubtotalAfter = roomSubtotal - discountSubtotalCents;
	const roomVatAfter = roomVat - discountVatCents;

	let subtotal = roomSubtotalAfter;
	let vat = roomVatAfter;

	let pricedFacilities = [];
	if (facilitySelections.length) {
		const ids = facilitySelections.map((s) => s.facility_package_id);
		const pkgs = await db
			.select()
			.from(facility_package)
			.where(
				and(
					inArray(facility_package.id, ids),
					eq(facility_package.is_active, true),
					isNull(facility_package.deletedAt),
				),
			);
		const pkgById = new Map(pkgs.map((p) => [p.id, p]));
		for (const sel of facilitySelections) {
			const pkg = pkgById.get(sel.facility_package_id);
			if (!pkg) {
				pricedFacilities.push({
					facility_package_id: sel.facility_package_id,
					quantity: sel.quantity,
					error: "Facility package no longer available.",
				});
				continue;
			}
			const priced = await priceFacilitySelection({ pkg, quantity: sel.quantity });
			pricedFacilities.push(priced);
			subtotal += priced.computed_subtotal_cents;
			vat += priced.computed_vat_cents;
		}
	}

	let ticketingInfo = null;
	if (ticketing?.enabled && ticketing?.room_id) {
		const [r] = await db
			.select({
				allow_ticketed_events: room.allow_ticketed_events,
				ticketing_setup_fee_pct_x100: room.ticketing_setup_fee_pct_x100,
			})
			.from(room)
			.where(eq(room.id, ticketing.room_id))
			.limit(1);
		if (r?.allow_ticketed_events && r.ticketing_setup_fee_pct_x100 > 0) {
			let eventDaySubtotalPreDiscount = 0;
			for (const seg of pricedSegments) {
				if (seg.error) continue;
				const bt = bookingTypeById.get(seg.booking_type_id);
				if (bt?.key === "event") {
					eventDaySubtotalPreDiscount += seg.computed_subtotal_cents ?? 0;
				}
			}
			const ticketingFee = Math.round(
				(eventDaySubtotalPreDiscount * r.ticketing_setup_fee_pct_x100) / 10000,
			);
			subtotal += ticketingFee;
			ticketingInfo = {
				enabled: true,
				setup_fee_pct_x100: r.ticketing_setup_fee_pct_x100,
				setup_fee_cents: ticketingFee,
				event_day_basis_cents: eventDaySubtotalPreDiscount,
			};
		}
	}

	return {
		segments: pricedSegments,
		facilities: pricedFacilities,
		subtotal_cents: subtotal,
		vat_cents: vat,
		total_cents: subtotal + vat,
		room_hire_subtotal_cents: roomSubtotal,
		room_hire_vat_cents: roomVat,
		discount: discountRow
			? {
				id: discountRow.id,
				label: discountRow.label,
				percent_x100: discountRow.percent_x100,
				applies_to: discountAppliedTo,
				amount_cents: discountSubtotalCents + discountVatCents,
				subtotal_off_cents: discountSubtotalCents,
				vat_off_cents: discountVatCents,
			}
			: null,
		ticketing: ticketingInfo,
	};
}

export function computeDeposit({ totalCents, depositPolicy }) {
	if (!depositPolicy || !totalCents) return { required_cents: 0, non_refundable_cents: 0 };
	const required_cents = Math.round((totalCents * depositPolicy.deposit_pct_x100) / 10000);
	const non_refundable_cents = Math.round((totalCents * depositPolicy.non_refundable_pct_x100) / 10000);
	return { required_cents, non_refundable_cents };
}
