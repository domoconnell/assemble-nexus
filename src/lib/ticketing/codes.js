import { randomBytes } from "node:crypto";

export function generateOrderReference() {
	const year = new Date().getFullYear();
	const tail = randomBytes(3).toString("hex").toUpperCase();
	return `TX-${year}-${tail}`;
}

export function generateTicketCode() {
	// Crockford-style alphabet (no easily-confused 0/O, I/1) for human-readable codes.
	const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
	const bytes = randomBytes(10);
	let out = "";
	for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
	return `${out.slice(0, 5)}-${out.slice(5)}`;
}
