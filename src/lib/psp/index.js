import { fakePsp } from "./fake.js";
import { stripePsp } from "./stripe.js";
import { getPaymentsSettings } from "@/db/queries/settings.js";

export const DRIVERS = {
	fake: fakePsp,
	stripe: stripePsp,
};

/**
 * Resolve the active PSP driver for a venue. Falls back to "fake" if no
 * setting row exists yet.
 */
export async function getActivePsp(venueId) {
	const settings = await getPaymentsSettings(venueId);
	const key = settings?.provider ?? "fake";
	const driver = DRIVERS[key];
	if (!driver) {
		throw new Error(`Unknown PSP provider: ${key}`);
	}
	return driver;
}

export function getPspByKey(key) {
	return DRIVERS[key] ?? null;
}
