import { and, eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { event } from "@/db/schema/entities/event.js";

export function slugify(s) {
	return String(s || "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function randomSlugPrefix() {
	const bytes = new Uint8Array(8);
	(globalThis.crypto ?? require("node:crypto").webcrypto).getRandomValues(bytes);
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let out = "";
	for (let i = 0; i < 5; i++) out += chars[bytes[i] % chars.length];
	return out;
}

/**
 * Generate an event slug of the shape `<5-char-prefix>-<slugified-title>`,
 * retrying with a new prefix until uniqueness within the venue is satisfied.
 */
export async function generateUniqueEventSlug(venueId, title) {
	const base = slugify(title) || "event";
	for (let attempt = 0; attempt < 8; attempt++) {
		const candidate = `${randomSlugPrefix()}-${base}`.slice(0, 120);
		const [existing] = await db
			.select({ id: event.id })
			.from(event)
			.where(and(eq(event.venue_id, venueId), eq(event.slug, candidate)))
			.limit(1);
		if (!existing) return candidate;
	}
	return `${randomSlugPrefix()}-${randomSlugPrefix()}-${base}`.slice(0, 120);
}
