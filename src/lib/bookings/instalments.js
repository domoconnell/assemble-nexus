// Stripe rejects PaymentIntents below 30p in GBP. Every chargeable
// instalment row needs to clear that floor; otherwise a booker would
// click "Pay" and the server action would 500.
export const STRIPE_MIN_CENTS = 30;

/**
 * Build the default 2-row deposit + balance split for a booking,
 * clamped so neither row falls below Stripe's £0.30 minimum. If the
 * total is too small to support two chargeable rows, returns a single
 * "Total" row (which still won't be chargeable via card, but at least
 * we don't seed two unreachable rows).
 *
 * Returns `[]` for zero-total bookings.
 */
export function buildDefaultBookingInstalments({ totalCents, depositRequiredCents }) {
	const total = Math.max(0, Math.round(totalCents ?? 0));
	if (total === 0) return [];

	const depositRaw = Math.min(Math.max(0, Math.round(depositRequiredCents ?? 0)), total);

	if (total < STRIPE_MIN_CENTS * 2) {
		return [{ label: "Total", amount_cents: total }];
	}

	let deposit = depositRaw;
	if (deposit > 0 && deposit < STRIPE_MIN_CENTS) deposit = STRIPE_MIN_CENTS;
	if (deposit > 0 && total - deposit < STRIPE_MIN_CENTS) deposit = total - STRIPE_MIN_CENTS;

	if (deposit <= 0) {
		return [{ label: "Total", amount_cents: total }];
	}

	return [
		{ label: "Deposit", amount_cents: deposit },
		{ label: "Balance", amount_cents: total - deposit },
	];
}
