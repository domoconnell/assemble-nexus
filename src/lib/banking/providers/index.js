import { starlingProvider } from "./starling.js";
import { revolutProvider } from "./revolut.js";
import { monzoProvider } from "./monzo.js";
import { stripeBankProvider } from "./stripe.js";

export const PROVIDERS = {
	starling: starlingProvider,
	revolut: revolutProvider,
	monzo: monzoProvider,
	stripe: stripeBankProvider,
};

export const PROVIDER_LIST = Object.values(PROVIDERS).map((p) => ({
	key: p.key,
	label: p.label,
	helpUrl: p.helpUrl ?? null,
}));

export function getProvider(key) {
	const p = PROVIDERS[key];
	if (!p) throw new Error(`Unknown bank provider: ${key}`);
	return p;
}
