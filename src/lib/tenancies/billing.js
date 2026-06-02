/**
 * Pure (no IO) billing helpers shared by the invoicer + the admin
 * invoice-preview UI. Given a tenancy_line + a set of sessions known to
 * fall in a particular month, work out the amount payable + a human
 * description for the invoice line.
 *
 * Sessions are expected to come pre-filtered to the month / billable
 * status. The functions don't load data from anywhere - feed them what
 * you've already pulled and they return billing primitives.
 */

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtGbp = (c) => gbp.format((c ?? 0) / 100);

/**
 * Sum the duration of `sessions` in whole minutes. Per-hour billing uses
 * the precise figure; we surface it for the invoice description so the
 * customer can see "1h 45m × £…" rather than guessing rounding.
 */
export function sumSessionMinutes(sessions) {
	let total = 0;
	for (const s of sessions ?? []) {
		const start = new Date(s.starts_at).getTime();
		const end = new Date(s.ends_at).getTime();
		if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
			total += Math.round((end - start) / 60000);
		}
	}
	return total;
}

function formatHoursLabel(minutes) {
	if (minutes <= 0) return "0 hrs";
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m} mins`;
	if (m === 0) return `${h} hr${h === 1 ? "" : "s"}`;
	return `${h}h ${m}m`;
}

/**
 * Build the table-row fields used on the invoice: rate basis, rate, quantity,
 * standard-rate subtotal, override description, reduced subtotal, reduction.
 *
 * For scheduled lines on a public room with a rack rate, the "Standard" is
 * the room's hourly rack × hours, and the line's billing config goes in the
 * Override column. For occupancy and for scheduled lines without a rack rate
 * (non-public rooms), the line's own rate is the standard — no override, no
 * reduction.
 *
 * Returns:
 *   {
 *     rate_basis,                // "Hourly" | "Occupancy" | "Per session" | "Fixed monthly"
 *     rate_cents,                // rate per unit
 *     quantity,                  // numeric quantity (hours / months / etc)
 *     quantity_label,            // human label for the quantity
 *     standard_rate_subtotal_cents,
 *     override_description,      // "£13/hour" / "£52/session" / "£X fixed" / ""
 *     reduced_subtotal_cents,    // == amount_cents
 *     reduction_cents,           // standard - reduced (positive when discounted)
 *   }
 */
function scheduledLineHasOverride(line) {
	return (
		(line.per_session_rate_cents ?? null) != null ||
		(line.per_hour_rate_cents ?? null) != null ||
		(line.fixed_monthly_rate_cents ?? null) != null
	);
}

function buildLineRowFields(line, billable, amountCents, rackHourlyRateCents) {
	const minutes = sumSessionMinutes(billable);

	if (line.kind === "occupancy") {
		const rate = line.monthly_rate_cents ?? 0;
		return {
			rate_basis: "Occupancy",
			rate_cents: rate,
			quantity_label: "1 mnth",
			standard_rate_subtotal_cents: rate,
			override_description: "",
			reduced_subtotal_cents: amountCents,
			reduction_cents: 0,
		};
	}

	// scheduled with a rack rate → Hourly standard, line billing is override
	if (rackHourlyRateCents != null) {
		const standard = Math.round((minutes / 60) * rackHourlyRateCents);
		let override = "";
		if (scheduledLineHasOverride(line)) {
			if (line.billing_mode === "per_hour" && line.per_hour_rate_cents != null) {
				override = `${fmtGbp(line.per_hour_rate_cents)}/hour`;
			} else if (line.billing_mode === "per_session" && line.per_session_rate_cents != null) {
				override = `${fmtGbp(line.per_session_rate_cents)}/session`;
			} else if (line.billing_mode === "fixed_monthly" && line.fixed_monthly_rate_cents != null) {
				override = `${fmtGbp(line.fixed_monthly_rate_cents)} fixed`;
			}
		}
		return {
			rate_basis: "Hourly",
			rate_cents: rackHourlyRateCents,
			quantity_label: formatHoursLabel(minutes),
			standard_rate_subtotal_cents: standard,
			override_description: override,
			reduced_subtotal_cents: amountCents,
			reduction_cents: standard - amountCents,
		};
	}

	// scheduled without a rack rate (non-public room or unconfigured pricing)
	// → the line's own billing IS the standard, no override, no reduction.
	if (line.billing_mode === "per_hour") {
		return {
			rate_basis: "Hourly",
			rate_cents: line.per_hour_rate_cents ?? 0,
			quantity_label: formatHoursLabel(minutes),
			standard_rate_subtotal_cents: amountCents,
			override_description: "",
			reduced_subtotal_cents: amountCents,
			reduction_cents: 0,
		};
	}
	if (line.billing_mode === "per_session") {
		const count = billable.length;
		return {
			rate_basis: "Per session",
			rate_cents: line.per_session_rate_cents ?? 0,
			quantity_label: `${count} session${count === 1 ? "" : "s"}`,
			standard_rate_subtotal_cents: amountCents,
			override_description: "",
			reduced_subtotal_cents: amountCents,
			reduction_cents: 0,
		};
	}
	return {
		rate_basis: "Fixed monthly",
		rate_cents: line.fixed_monthly_rate_cents ?? 0,
		quantity_label: "1 month",
		standard_rate_subtotal_cents: amountCents,
		override_description: "",
		reduced_subtotal_cents: amountCents,
		reduction_cents: 0,
	};
}

/**
 * Compute one invoice-line worth of billing for a given tenancy_line
 * and the sessions that landed in the period.
 *
 * `rackHourlyRateCents` is the room's headline hourly rate (the figure
 * the public booking site would charge an event-day customer). When
 * given, the returned line includes `rack_cents` (what the same sessions
 * would have cost at the rack rate) and `discount_cents` (rack - amount).
 * Only scheduled lines with sessions get rack figures; occupancy and
 * sessionless months are skipped.
 *
 * Returns:
 *   {
 *     description,        // "Room 1D — full-time occupancy"
 *     kind,               // occupancy | scheduled
 *     billing_mode,       // per_session | per_hour | fixed_monthly | null
 *     quantity,           // sessions count / minutes / null
 *     unit_cents,         // rate snapshot / null
 *     amount_cents,       // payable for the month
 *     rack_cents,         // what the same sessions cost at rack rate (or null)
 *     discount_cents,     // rack - amount (or null)
 *   }
 */
export function computeLineForMonth(line, sessionsForMonth, { rackHourlyRateCents = null } = {}) {
	const billable = (sessionsForMonth ?? []).filter(
		(s) => s.status !== "cancelled" && !s.invoice_id,
	);
	const roomName = line.room_name || "Room";

	if (line.kind === "occupancy") {
		const amount = line.monthly_rate_cents ?? 0;
		const row = buildLineRowFields(line, billable, amount, rackHourlyRateCents);
		return {
			description: `${roomName} — full-time occupancy`,
			room_name: roomName,
			kind: "occupancy",
			billing_mode: null,
			quantity: null,
			unit_cents: null,
			amount_cents: amount,
			rack_hourly_rate_cents: null,
			rack_cents: null,
			discount_cents: null,
			...row,
		};
	}

	const labelPrefix = line.label ? `${roomName} — ${line.label}` : roomName;
	const minutes = sumSessionMinutes(billable);
	const rack =
		rackHourlyRateCents != null && minutes > 0
			? Math.round((minutes / 60) * rackHourlyRateCents)
			: null;

	// "No override" case: rate left blank on the line, so it bills at the
	// room's standard hourly rate. If no rack rate is configured for the
	// room, the line bills nothing (the form validator should catch this
	// before save, but we render zero rather than crash).
	if (!scheduledLineHasOverride(line)) {
		const amount = rack ?? 0;
		const row = buildLineRowFields(
			line,
			billable,
			amount,
			rackHourlyRateCents,
		);
		return {
			description:
				rackHourlyRateCents != null
					? minutes
						? `${labelPrefix}: ${formatHoursLabel(minutes)} × ${fmtGbp(rackHourlyRateCents)}/hr (standard)`
						: `${labelPrefix}: no sessions this month`
					: `${labelPrefix}: rate not set`,
			room_name: roomName,
			kind: "scheduled",
			billing_mode: rackHourlyRateCents != null ? "per_hour" : (line.billing_mode ?? null),
			quantity: rackHourlyRateCents != null ? minutes : null,
			unit_cents: rackHourlyRateCents,
			amount_cents: amount,
			rack_hourly_rate_cents: rackHourlyRateCents,
			rack_cents: rack,
			discount_cents: rack != null ? 0 : null,
			...row,
		};
	}

	if (line.billing_mode === "per_session") {
		const count = billable.length;
		const unit = line.per_session_rate_cents ?? 0;
		const amount = count * unit;
		const row = buildLineRowFields(line, billable, amount, rackHourlyRateCents);
		return {
			description: count
				? `${labelPrefix}: ${count} session${count === 1 ? "" : "s"} × ${fmtGbp(unit)}`
				: `${labelPrefix}: no sessions this month`,
			room_name: roomName,
			kind: "scheduled",
			billing_mode: "per_session",
			quantity: count,
			unit_cents: unit,
			amount_cents: amount,
			rack_hourly_rate_cents: rackHourlyRateCents,
			rack_cents: rack,
			discount_cents: rack != null ? rack - amount : null,
			...row,
		};
	}

	if (line.billing_mode === "per_hour") {
		// `per_hour_rate_cents` is the rate per WHOLE hour - we bill
		// proportionally per-minute so a 1h45 session at £20/hr = £35.
		const unit = line.per_hour_rate_cents ?? 0;
		const amount = Math.round((minutes / 60) * unit);
		const row = buildLineRowFields(line, billable, amount, rackHourlyRateCents);
		return {
			description: minutes
				? `${labelPrefix}: ${formatHoursLabel(minutes)} × ${fmtGbp(unit)}/hr`
				: `${labelPrefix}: no sessions this month`,
			room_name: roomName,
			kind: "scheduled",
			billing_mode: "per_hour",
			quantity: minutes, // minutes, not hours — keeps integer storage faithful
			unit_cents: unit,
			amount_cents: amount,
			rack_hourly_rate_cents: rackHourlyRateCents,
			rack_cents: rack,
			discount_cents: rack != null ? rack - amount : null,
			...row,
		};
	}

	if (line.billing_mode === "fixed_monthly") {
		const amount = line.fixed_monthly_rate_cents ?? 0;
		const row = buildLineRowFields(line, billable, amount, rackHourlyRateCents);
		return {
			description: `${labelPrefix}: fixed monthly`,
			room_name: roomName,
			kind: "scheduled",
			billing_mode: "fixed_monthly",
			quantity: null,
			unit_cents: null,
			amount_cents: amount,
			rack_hourly_rate_cents: rackHourlyRateCents,
			rack_cents: rack,
			discount_cents: rack != null ? rack - amount : null,
			...row,
		};
	}

	// Unknown billing mode → zero, so the invoice doesn't silently include
	// a line with random amount.
	return {
		description: `${labelPrefix}: (no billing mode set)`,
		room_name: roomName,
		kind: "scheduled",
		billing_mode: null,
		quantity: null,
		unit_cents: null,
		amount_cents: 0,
		rack_hourly_rate_cents: null,
		rack_cents: null,
		discount_cents: null,
		rate_basis: "",
		rate_cents: 0,
		quantity_label: "",
		standard_rate_subtotal_cents: 0,
		override_description: "",
		reduced_subtotal_cents: 0,
		reduction_cents: 0,
	};
}

/**
 * Run `computeLineForMonth` over every line for a tenancy, then apply
 * any `monthly_override_cents` on the tenancy. When an override applies,
 * the override "owns" the headline figure and we surface the would-have-
 * been sum so the invoice can show the adjustment.
 *
 * Inputs:
 *   tenancy       { monthly_override_cents }
 *   lines         tenancy_line rows for the tenancy
 *   sessionsByLine Map<tenancy_line_id, session[]> of sessions in the
 *                  target month (only matters for scheduled lines)
 *
 * Output:
 *   {
 *     lines: [{ tenancy_line_id, ...computeLine } ...],
 *     subtotal_cents: number,                   // sum of line amounts
 *     billed_cents: number,                     // override OR subtotal
 *     adjustment_cents: number,                 // billed - subtotal (signed)
 *     uncapped_subtotal_cents: number | null,   // subtotal when override applied, else null
 *   }
 */
export function computeInvoiceForMonth({ tenancy, lines, sessionsByLine, rackRatesByRoomId = null }) {
	const computed = (lines ?? []).map((l) => {
		const sessions = sessionsByLine?.get?.(l.id) ?? [];
		const rackHourlyRateCents = rackRatesByRoomId?.[l.room_id] ?? null;
		return {
			tenancy_line_id: l.id,
			...computeLineForMonth(l, sessions, { rackHourlyRateCents }),
		};
	});
	const subtotal = computed.reduce((s, l) => s + (l.amount_cents ?? 0), 0);
	const rackSubtotal = computed.reduce(
		(s, l) => s + (l.rack_cents ?? l.amount_cents ?? 0),
		0,
	);
	const lineDiscountTotal = computed.reduce(
		(s, l) => s + (l.discount_cents ?? 0),
		0,
	);

	const override = tenancy?.monthly_override_cents;
	if (override != null) {
		return {
			lines: computed,
			subtotal_cents: subtotal,
			rack_subtotal_cents: rackSubtotal,
			line_discount_total_cents: lineDiscountTotal,
			billed_cents: override,
			adjustment_cents: override - subtotal,
			uncapped_subtotal_cents: subtotal,
		};
	}
	return {
		lines: computed,
		subtotal_cents: subtotal,
		rack_subtotal_cents: rackSubtotal,
		line_discount_total_cents: lineDiscountTotal,
		billed_cents: subtotal,
		adjustment_cents: 0,
		uncapped_subtotal_cents: null,
	};
}
