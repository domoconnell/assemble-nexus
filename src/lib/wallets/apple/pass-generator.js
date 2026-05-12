import fs from "node:fs/promises";
import path from "node:path";
import { PKPass } from "passkit-generator";

const WWDR_PATH = path.join(process.cwd(), "secrets/wallets/apple-wwdr.pem");

// Brand assets live under public/. Apple wants standard pass image slots —
// we map our existing icon + wordmark onto them. Retina @2x/@3x reuse the
// same files; iOS will scale appropriately for our needs in v1.
const ICON_PATH = path.join(process.cwd(), "public/assembly-rooms-icon-white.png");
const LOGO_PATH = path.join(process.cwd(), "public/assembly-rooms-white.png");

let cachedWwdr = null;
let cachedIcon = null;
let cachedLogo = null;

async function loadAsset(p, cache) {
	if (cache.value) return cache.value;
	cache.value = await fs.readFile(p);
	return cache.value;
}

async function loadWwdr() {
	if (cachedWwdr) return cachedWwdr;
	try {
		cachedWwdr = await fs.readFile(WWDR_PATH);
	} catch {
		throw new Error(
			`Apple WWDR intermediate certificate not found at ${WWDR_PATH}. ` +
				`Download AppleWWDRCAG4.cer from https://www.apple.com/certificateauthority/ ` +
				`and convert it to PEM (openssl x509 -inform DER -in AppleWWDRCAG4.cer -out apple-wwdr.pem).`,
		);
	}
	return cachedWwdr;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

/**
 * Build a signed .pkpass buffer for a ticket. `ticket` is the row shape
 * returned by `getTicketForPdf` (event_title, holder_name, code, etc.).
 * `settings` is the venue's apple_wallet setting block.
 */
export async function generateTicketPkPass({ ticket, settings }) {
	if (!settings?.signer_cert_pem || !settings?.signer_key_pem) {
		throw new Error("Apple Wallet isn't configured for this venue.");
	}

	const [wwdr, iconBuf, logoBuf] = await Promise.all([
		loadWwdr(),
		loadAsset(ICON_PATH, (cachedIcon = cachedIcon ?? { value: null })),
		loadAsset(LOGO_PATH, (cachedLogo = cachedLogo ?? { value: null })),
	]);

	const startsAt = ticket.event_starts_at ? new Date(ticket.event_starts_at) : null;
	const endsAt = ticket.event_ends_at ? new Date(ticket.event_ends_at) : null;
	const dateLabel = startsAt ? dateFmt.format(startsAt) : "Date TBA";
	const timeLabel =
		startsAt && endsAt
			? `${timeFmt.format(startsAt)} – ${timeFmt.format(endsAt)}`
			: startsAt
				? timeFmt.format(startsAt)
				: "";

	const pass = new PKPass(
		{
			"icon.png": iconBuf,
			"icon@2x.png": iconBuf,
			"icon@3x.png": iconBuf,
			"logo.png": logoBuf,
			"logo@2x.png": logoBuf,
		},
		{
			wwdr,
			signerCert: Buffer.from(settings.signer_cert_pem),
			signerKey: Buffer.from(settings.signer_key_pem),
		},
		{
			formatVersion: 1,
			passTypeIdentifier: settings.pass_type_identifier,
			teamIdentifier: settings.team_identifier,
			organizationName: settings.organisation_name,
			serialNumber: ticket.code,
			description: ticket.event_title || "Event ticket",
			foregroundColor: "rgb(255, 255, 255)",
			backgroundColor: "rgb(15, 23, 42)",
			labelColor: "rgb(160, 200, 220)",
			relevantDate: startsAt ? startsAt.toISOString() : undefined,
		},
	);

	// passkit-generator v3 uses imperative setters for the pass-type fields.
	// Setting `type` provisions the field arrays; pushing fills them.
	pass.type = "eventTicket";

	pass.primaryFields.push({
		key: "event",
		label: "EVENT",
		value: ticket.event_title || "",
	});
	pass.secondaryFields.push({
		key: "date",
		label: "DATE",
		value: dateLabel,
	});
	if (timeLabel) {
		pass.secondaryFields.push({
			key: "time",
			label: "TIME",
			value: timeLabel,
		});
	}
	if (ticket.venue_name) {
		pass.auxiliaryFields.push({
			key: "venue",
			label: "VENUE",
			value: ticket.venue_name,
		});
	}
	if (ticket.holder_name) {
		pass.auxiliaryFields.push({
			key: "holder",
			label: "HOLDER",
			value: ticket.holder_name,
		});
	}
	pass.backFields.push(
		{
			key: "reference",
			label: "Order reference",
			value: ticket.order_reference || ticket.code,
		},
		{
			key: "ticketCode",
			label: "Ticket code",
			value: ticket.code,
		},
	);

	pass.setBarcodes({
		message: ticket.code,
		format: "PKBarcodeFormatQR",
		messageEncoding: "iso-8859-1",
		altText: ticket.code,
	});

	return pass.getAsBuffer();
}
