import { and, eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { setting } from "@/db/schema/entities/setting.js";

export async function getSetting(venueId, key, defaultValue = null) {
	const [row] = await db
		.select()
		.from(setting)
		.where(and(eq(setting.venue_id, venueId), eq(setting.key, key)))
		.limit(1);
	return row?.value ?? defaultValue;
}

export async function saveSetting(venueId, key, value) {
	const [existing] = await db
		.select()
		.from(setting)
		.where(and(eq(setting.venue_id, venueId), eq(setting.key, key)))
		.limit(1);
	if (existing) {
		const [updated] = await db
			.update(setting)
			.set({ value })
			.where(eq(setting.id, existing.id))
			.returning();
		return updated;
	}
	const [created] = await db
		.insert(setting)
		.values({ venue_id: venueId, key, value })
		.returning();
	return created;
}

export async function getTicketingSettings(venueId) {
	return getSetting(venueId, "ticketing", {
		platform_fee_pct_x100: 0,
		platform_fee_flat_cents: 0,
	});
}

export async function getPaymentsSettings(venueId) {
	return getSetting(venueId, "payments", { provider: "fake" });
}

export async function getAppleWalletSettings(venueId) {
	return getSetting(venueId, "apple_wallet", null);
}

export async function getGoogleWalletSettings(venueId) {
	return getSetting(venueId, "google_wallet", null);
}

export async function getSquareSettings(venueId) {
	return getSetting(venueId, "square", null);
}

export async function getStripeSettings(venueId) {
	return getSetting(venueId, "stripe", null);
}

/**
 * Identifier(s) for the church's bank account. Used by the bank sync to
 * auto-flag outbound transactions as church transfers. Any single
 * non-empty field is enough to match - the sync ORs them. `account_number`
 * is the last 4 digits (Starling gives us the full number, Revolut often
 * just the last 4).
 */
export async function getChurchTransferSettings(venueId) {
	return getSetting(venueId, "church_transfer", {
		counterparty_name: "",
		sort_code: "",
		account_number: "",
	});
}

/**
 * Email recipients for the monthly board-pack PDF cron. Stored as an
 * array of `{ email, name? }` entries so the admin UI can label trustees
 * vs directors etc.
 */
export async function getBoardReportRecipients(venueId) {
	return getSetting(venueId, "board_report_recipients", { recipients: [] });
}

/**
 * Log of which months have already been emailed out, keyed by `ym`.
 * The monthly cron reads this for idempotency (don't re-send) and the
 * Board reports admin page reads it to render "Sent on X" badges.
 */
export async function getBoardReportHistory(venueId) {
	return getSetting(venueId, "board_report_history", { sent: [] });
}

export async function appendBoardReportSent(venueId, entry) {
	const current = await getBoardReportHistory(venueId);
	const filtered = (current.sent ?? []).filter((s) => s.ym !== entry.ym);
	const next = { sent: [...filtered, entry].sort((a, b) => a.ym.localeCompare(b.ym)) };
	await saveSetting(venueId, "board_report_history", next);
	return next;
}

/**
 * Cheap "is this venue configured to issue wallet passes?" check used by
 * the ticket-detail UI to decide whether to render the Add to Wallet
 * buttons.
 */
export async function getWalletProvidersStatus(venueId) {
	const [apple, google] = await Promise.all([
		getAppleWalletSettings(venueId),
		getGoogleWalletSettings(venueId),
	]);
	return {
		apple_ready: Boolean(
			apple?.pass_type_identifier &&
				apple?.team_identifier &&
				apple?.signer_cert_pem &&
				apple?.signer_key_pem,
		),
		google_ready: Boolean(google?.issuer_id && google?.service_account_json),
	};
}

export const DEFAULT_HOURLY_BANDS = [
	{ label: "Early", from: "07:00", to: "09:00", modifier_x100: 12000 },
	{ label: "Standard", from: "09:00", to: "17:00", modifier_x100: 10000 },
	{ label: "Evening", from: "17:00", to: "21:00", modifier_x100: 12000 },
	{ label: "Late", from: "21:00", to: "24:00", modifier_x100: 13000 },
];

export async function getHourlyBands(venueId) {
	const stored = await getSetting(venueId, "hourly_bands", null);
	if (!stored || !Array.isArray(stored.bands) || stored.bands.length === 0) {
		return { bands: DEFAULT_HOURLY_BANDS };
	}
	return stored;
}
