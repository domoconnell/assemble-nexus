import { randomBytes } from "node:crypto";

export function generateBookingReference() {
	return `BK-${randomBytes(3).toString("hex").toUpperCase()}`;
}
