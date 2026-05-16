import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { event } from "@/db/schema/entities/event.js";

// Unambiguous alphabet - no 0/o, 1/l/i, etc. Lowercase only so a copied URL
// works regardless of caps lock.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomCode(length = 8) {
	const crypto = globalThis.crypto ?? require("node:crypto").webcrypto;
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let out = "";
	for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
	return out;
}

export async function generateUniqueCheckinCode() {
	for (let attempt = 0; attempt < 12; attempt++) {
		const code = randomCode(8);
		const [existing] = await db
			.select({ id: event.id })
			.from(event)
			.where(eq(event.checkin_code, code))
			.limit(1);
		if (!existing) return code;
	}
	return randomCode(10);
}

export async function ensureCheckinCode(eventId) {
	const [row] = await db
		.select({ checkin_code: event.checkin_code })
		.from(event)
		.where(eq(event.id, eventId))
		.limit(1);
	if (row?.checkin_code) return row.checkin_code;
	const code = await generateUniqueCheckinCode();
	await db.update(event).set({ checkin_code: code }).where(eq(event.id, eventId));
	return code;
}

export async function rotateCheckinCode(eventId) {
	const code = await generateUniqueCheckinCode();
	await db.update(event).set({ checkin_code: code }).where(eq(event.id, eventId));
	return code;
}
