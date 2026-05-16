import crypto from "node:crypto";
import { db } from "@/db/index.js";
import { user as userTable } from "@/db/schema/entities/user.js";
import { session as sessionTable } from "@/db/schema/auth_schema.js";
import { eq } from "drizzle-orm";

const SESSION_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days, matches better-auth default
const TOKEN_BYTES = 16; // 32 hex chars

/**
 * Create a session for an arbitrary user and return the Set-Cookie headers
 * to attach to the API response. Used to auto-log-in brand-new users at
 * order/booking time so they don't have to come back through a magic link
 * to view what they just bought.
 *
 * Mirrors better-auth's cookie format: value is `token.HMAC-SHA256(token,
 * secret)` base64, URL-encoded. Cookie name uses the same prefix
 * (`<APP_SHORT_NAME>.session_token`) so the existing `auth.api.getSession`
 * picks it up unchanged.
 *
 * Returns an array of Set-Cookie header strings ready to append to the
 * response.
 */
export async function startAutoSession({ userId, ipAddress = null, userAgent = null } = {}) {
	if (!userId) throw new Error("userId required");
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error("BETTER_AUTH_SECRET not set");

	const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
	const id = crypto.randomBytes(TOKEN_BYTES).toString("hex");
	const now = new Date();
	const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_SECONDS * 1000);

	await db.insert(sessionTable).values({
		id,
		token,
		userId,
		expiresAt,
		ipAddress,
		userAgent,
		createdAt: now,
		updatedAt: now,
	});

	const cookieValue = await signCookieValue(token, secret);
	const isProd = process.env.NODE_ENV === "production";
	const cookiePrefix = process.env.APP_SHORT_NAME || "app";
	// Match better-auth's prod-mode `__Secure-` cookie-name prefix, otherwise
	// auth.api.getSession won't find sessions we created here.
	const cookieName = isProd
		? `__Secure-${cookiePrefix}.session_token`
		: `${cookiePrefix}.session_token`;

	const attributes = [
		`${cookieName}=${cookieValue}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		`Max-Age=${SESSION_EXPIRY_SECONDS}`,
		`Expires=${expiresAt.toUTCString()}`,
	];
	if (isProd) attributes.push("Secure");

	return {
		token,
		expiresAt,
		setCookieHeaders: [attributes.join("; ")],
	};
}

/**
 * Match better-auth/better-call's cookie signature scheme:
 *   value = encodeURIComponent(`${rawValue}.${HMAC-SHA256(rawValue, secret) base64}`)
 */
async function signCookieValue(value, secret) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sigBuffer = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(value),
	);
	const sigB64 = Buffer.from(sigBuffer).toString("base64");
	return encodeURIComponent(`${value}.${sigB64}`);
}

/**
 * Look up an existing user by email (case-insensitive) - used by the
 * identity dialog to branch new-vs-existing before sending magic link or
 * creating an account.
 */
export async function findUserByEmail(email) {
	const lowered = String(email || "").trim().toLowerCase();
	if (!lowered) return null;
	const [u] = await db
		.select()
		.from(userTable)
		.where(eq(userTable.email, lowered))
		.limit(1);
	return u ?? null;
}
