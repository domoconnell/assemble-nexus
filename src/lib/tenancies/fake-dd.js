import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { fake_dd_session } from "@/db/schema/entities/fake_dd_session.js";

/**
 * FakePSP equivalent of the Stripe Bacs Direct Debit driver. Same call
 * shape as `stripe-dd.js` so the public-bare DD pages and the invoicer
 * can swap implementations behind the dispatcher without caring.
 *
 * Persistence lives in `fake_dd_session` so sessions survive restarts.
 *
 * Decline rule (matches the rest of FakePSP): an account number ending
 * "0000" simulates a hard decline at submission time.
 */

export async function createBacsDdSession({
	tenancy,
	successUrl,
	cancelUrl,
	origin,
}) {
	const external_id = `fdd_${randomUUID()}`;
	// successUrl already carries `?session_id={CHECKOUT_SESSION_ID}` in
	// the real Stripe contract. Match exactly so callers can stay agnostic.
	const [row] = await db
		.insert(fake_dd_session)
		.values({
			external_id,
			tenancy_id: tenancy.id,
			status: "open",
			success_url: successUrl,
			cancel_url: cancelUrl,
		})
		.returning();
	const sandboxUrl = `${origin}/tenancy/${tenancy.dd_token}/direct-debit/sandbox?session_id=${row.external_id}`;
	return {
		id: row.external_id,
		url: sandboxUrl,
	};
}

export async function getFakeSession(sessionId) {
	if (!sessionId) return null;
	const [row] = await db
		.select()
		.from(fake_dd_session)
		.where(eq(fake_dd_session.external_id, sessionId))
		.limit(1);
	return row ?? null;
}

/**
 * Mirror of Stripe's `fetchSessionMandate` - returns the captured mandate
 * IDs only once the sandbox has been completed.
 */
export async function fetchSessionMandate(sessionId) {
	const row = await getFakeSession(sessionId);
	if (!row || row.status !== "complete") return null;
	return {
		customer_id: row.customer_id,
		payment_method_id: row.payment_method_id,
	};
}

/**
 * Persist a submitted sandbox form. Used by the sandbox page's server
 * action. Decline rule: account number ending in "0000" hard-declines.
 * Returns `{ ok: true, next_url }` for success, throws otherwise.
 */
export async function completeSandboxSession({
	sessionId,
	accountName,
	sortCode,
	accountNumber,
}) {
	const row = await getFakeSession(sessionId);
	if (!row) throw new Error("Unknown setup session.");
	if (row.status === "cancelled") throw new Error("This session was cancelled.");
	if (row.status === "complete") {
		const append = appendSessionId(row.success_url, row.external_id);
		return { ok: true, next_url: append };
	}

	const cleanNumber = String(accountNumber ?? "").replace(/\s+/g, "");
	if (!/^\d{8}$/.test(cleanNumber)) {
		throw new Error("Account number must be 8 digits.");
	}
	const cleanSort = String(sortCode ?? "").replace(/[^\d]/g, "");
	if (!/^\d{6}$/.test(cleanSort)) {
		throw new Error("Sort code must be 6 digits (e.g. 12-34-56).");
	}
	const cleanName = String(accountName ?? "").trim();
	if (cleanName.length < 2) {
		throw new Error("Account holder name is required.");
	}

	if (cleanNumber.endsWith("0000")) {
		const err = new Error(
			"Your bank declined this Direct Debit instruction. Please check the details and try again.",
		);
		err.code = "bank_declined";
		throw err;
	}

	const customer_id = `fcus_${randomUUID().slice(0, 16)}`;
	const payment_method_id = `fpm_${randomUUID().slice(0, 16)}`;

	await db
		.update(fake_dd_session)
		.set({
			status: "complete",
			account_name: cleanName,
			account_last4: cleanNumber.slice(-4),
			sort_code: `${cleanSort.slice(0, 2)}-${cleanSort.slice(2, 4)}-${cleanSort.slice(4, 6)}`,
			customer_id,
			payment_method_id,
			completed_at: new Date(),
		})
		.where(eq(fake_dd_session.id, row.id));

	return {
		ok: true,
		next_url: appendSessionId(row.success_url, row.external_id),
	};
}

export async function cancelSandboxSession(sessionId) {
	const row = await getFakeSession(sessionId);
	if (!row) throw new Error("Unknown setup session.");
	if (row.status === "complete") {
		throw new Error("Session already completed - cannot cancel.");
	}
	if (row.status === "open") {
		await db
			.update(fake_dd_session)
			.set({ status: "cancelled", cancelled_at: new Date() })
			.where(eq(fake_dd_session.id, row.id));
	}
	return { ok: true, next_url: row.cancel_url };
}

/**
 * Stand-in for Stripe's `chargeMandate`. Mimics a real Bacs charge by
 * returning a `processing` payment intent immediately - real Bacs takes
 * a few business days to clear, and the invoicer already tolerates that
 * status. A follow-up "fake DD webhook" admin tool can flip it later if
 * the tester wants to simulate success/failure.
 */
export async function chargeMandate({
	customerId,
	paymentMethodId,
	amountCents,
	metadata = {},
}) {
	if (!customerId || !paymentMethodId) {
		throw new Error("Missing mandate identifiers for fake charge.");
	}
	return {
		id: `fpi_${randomUUID()}`,
		object: "payment_intent",
		status: "processing",
		amount: amountCents,
		currency: "gbp",
		customer: customerId,
		payment_method: paymentMethodId,
		metadata,
	};
}

function appendSessionId(url, id) {
	const sep = url.includes("?") ? "&" : "?";
	// `{CHECKOUT_SESSION_ID}` is the Stripe placeholder convention - if
	// it's there, swap it in place; otherwise append as a fresh query param.
	if (url.includes("{CHECKOUT_SESSION_ID}")) {
		return url.replace("{CHECKOUT_SESSION_ID}", encodeURIComponent(id));
	}
	return `${url}${sep}session_id=${encodeURIComponent(id)}`;
}
