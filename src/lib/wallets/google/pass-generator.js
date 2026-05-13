import crypto from "node:crypto";

/**
 * Google Wallet — Event Ticket pass generator.
 *
 * Two-step model: a `class` defines the pass design (per event), an `object`
 * is the individual ticket instance. We ensure the class exists, then ensure
 * the object exists, then return a signed "save to wallet" URL the browser
 * can redirect to.
 *
 * Auth: service-account JWT bearer → OAuth2 access token. Save link: a
 * separate RS256 JWT pointing at the object IDs, served at
 * `https://pay.google.com/gp/v/save/<jwt>`.
 *
 * No external dependency — uses Node `crypto`, same as our DB-side probe.
 */

const ISSUER_API = "https://walletobjects.googleapis.com/walletobjects/v1";
const SAVE_LINK_PREFIX = "https://pay.google.com/gp/v/save/";
const TOKEN_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

function base64url(input) {
	return Buffer.from(input)
		.toString("base64")
		.replace(/=+$/, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function signRs256(input, privateKeyPem) {
	const signer = crypto.createSign("RSA-SHA256");
	signer.update(input);
	signer.end();
	return signer.sign(privateKeyPem);
}

function signJwt(claims, privateKeyPem) {
	const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const payload = base64url(JSON.stringify(claims));
	const signature = base64url(signRs256(`${header}.${payload}`, privateKeyPem));
	return `${header}.${payload}.${signature}`;
}

async function getAccessToken(sa) {
	const now = Math.floor(Date.now() / 1000);
	const assertion = signJwt(
		{
			iss: sa.client_email,
			scope: TOKEN_SCOPE,
			aud: sa.token_uri || DEFAULT_TOKEN_URI,
			exp: now + 3600,
			iat: now,
		},
		sa.private_key,
	);
	const res = await fetch(sa.token_uri || DEFAULT_TOKEN_URI, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion,
		}),
	});
	const json = await res.json().catch(() => null);
	if (!res.ok) {
		throw new Error(`Google token exchange failed: ${res.status} ${JSON.stringify(json)}`);
	}
	return json.access_token;
}

async function googleApi(accessToken, method, path, body) {
	const res = await fetch(`${ISSUER_API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	const json = text ? JSON.parse(text) : null;
	return { status: res.status, body: json };
}

async function ensureClass(accessToken, classId, classBody) {
	const head = await googleApi(accessToken, "GET", `/eventTicketClass/${encodeURIComponent(classId)}`);
	if (head.status === 200) return;
	if (head.status !== 404) {
		throw new Error(`Wallet class lookup failed: ${head.status} ${JSON.stringify(head.body)}`);
	}
	const created = await googleApi(accessToken, "POST", `/eventTicketClass`, classBody);
	if (created.status !== 200) {
		throw new Error(`Wallet class create failed: ${created.status} ${JSON.stringify(created.body)}`);
	}
}

async function ensureObject(accessToken, objectId, objectBody) {
	const head = await googleApi(accessToken, "GET", `/eventTicketObject/${encodeURIComponent(objectId)}`);
	if (head.status === 200) return;
	if (head.status !== 404) {
		throw new Error(`Wallet object lookup failed: ${head.status} ${JSON.stringify(head.body)}`);
	}
	const created = await googleApi(accessToken, "POST", `/eventTicketObject`, objectBody);
	if (created.status !== 200) {
		throw new Error(`Wallet object create failed: ${created.status} ${JSON.stringify(created.body)}`);
	}
}

function buildClassBody({ classId, ticket, issuerName }) {
	const startsAt = ticket.event_starts_at ? new Date(ticket.event_starts_at) : null;
	const endsAt = ticket.event_ends_at ? new Date(ticket.event_ends_at) : null;
	const doorsAt = ticket.event_doors_open_at ? new Date(ticket.event_doors_open_at) : null;
	return {
		id: classId,
		issuerName,
		reviewStatus: "UNDER_REVIEW",
		eventName: {
			defaultValue: { language: "en-GB", value: ticket.event_title || "Event" },
		},
		venue: ticket.venue_name
			? {
					name: { defaultValue: { language: "en-GB", value: ticket.venue_name } },
					address: { defaultValue: { language: "en-GB", value: ticket.venue_name } },
				}
			: undefined,
		dateTime: {
			start: startsAt ? startsAt.toISOString() : undefined,
			end: endsAt ? endsAt.toISOString() : undefined,
			doorsOpen: doorsAt ? doorsAt.toISOString() : undefined,
		},
		hexBackgroundColor: "#0f172a",
		multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
	};
}

function buildObjectBody({ objectId, classId, ticket }) {
	return {
		id: objectId,
		classId,
		state: "ACTIVE",
		barcode: {
			type: "QR_CODE",
			value: ticket.code,
			alternateText: ticket.code,
		},
		ticketHolderName: ticket.holder_name || undefined,
		ticketNumber: ticket.code,
		ticketType: ticket.ticket_type_label
			? {
					defaultValue: { language: "en-GB", value: ticket.ticket_type_label },
				}
			: undefined,
	};
}

/**
 * Main entry. Idempotent — calling repeatedly for the same ticket reuses the
 * existing class + object and just returns a fresh save URL.
 */
export async function getGoogleWalletSaveUrl({ ticket, settings, baseUrl }) {
	if (!settings?.issuer_id || !settings?.service_account_json) {
		throw new Error("Google Wallet isn't configured for this venue.");
	}
	const sa =
		typeof settings.service_account_json === "string"
			? JSON.parse(settings.service_account_json)
			: settings.service_account_json;

	const classSuffix = settings.class_suffix || "ticket";
	const classId = `${settings.issuer_id}.${classSuffix}-event-${ticket.event_id}`;
	const objectId = `${settings.issuer_id}.${classSuffix}-ticket-${ticket.code}`;

	const accessToken = await getAccessToken(sa);
	await ensureClass(accessToken, classId, buildClassBody({
		classId,
		ticket,
		issuerName: ticket.venue_name || "The Assembly Rooms",
	}));
	await ensureObject(accessToken, objectId, buildObjectBody({ objectId, classId, ticket }));

	const now = Math.floor(Date.now() / 1000);
	const origin = baseUrl ? new URL(baseUrl).origin : null;
	const saveJwt = signJwt(
		{
			iss: sa.client_email,
			aud: "google",
			typ: "savetowallet",
			iat: now,
			origins: origin ? [origin] : [],
			payload: {
				eventTicketObjects: [{ id: objectId }],
			},
		},
		sa.private_key,
	);
	return `${SAVE_LINK_PREFIX}${saveJwt}`;
}
