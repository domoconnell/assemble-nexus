"use server";

import { z } from "zod";
import {
	completeSandboxSession,
	cancelSandboxSession,
	getFakeSession,
} from "@/lib/tenancies/fake-dd.js";

const SubmitSchema = z.object({
	session_id: z.string().min(1),
	account_name: z.string().min(2).max(200),
	sort_code: z.string().min(6).max(8),
	account_number: z.string().min(8).max(8),
});

/**
 * Sandbox-form submission. Mirrors what the real Stripe Checkout flow
 * would do for the tenant: capture the bank details, simulate auth, then
 * hand control back to the venue's success_url with `session_id` so the
 * /done page can pull the resulting mandate.
 */
export async function submitSandboxAction(input) {
	const parsed = SubmitSchema.parse(input);
	const session = await getFakeSession(parsed.session_id);
	if (!session) throw new Error("Unknown setup session.");
	return completeSandboxSession({
		sessionId: parsed.session_id,
		accountName: parsed.account_name,
		sortCode: parsed.sort_code,
		accountNumber: parsed.account_number,
	});
}

export async function cancelSandboxAction(sessionId) {
	if (!sessionId) throw new Error("Missing session id.");
	return cancelSandboxSession(sessionId);
}
