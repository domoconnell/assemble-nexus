"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import {
	getAgreementByToken,
	updateAgreement,
} from "@/db/queries/tenancies.js";
import { sendTenancyAgreementSignedEmail } from "@/utils/email/tenancy-emails.js";

const SignSchema = z.object({
	token: z.string().min(1),
	signed_by_name: z.string().min(1).max(200),
});

/**
 * Record a tenant's digital signature on a specific tenancy agreement.
 * Idempotent: re-signing a row already in the `signed` state is a no-op.
 *
 * Returns the next URL the tenant should be sent to:
 *   - if the tenancy has no active direct debit AND has a dd_token,
 *     return that DD setup URL so the agreement page can chain them
 *     through;
 *   - otherwise, null (the page renders its own "signed, all done" UI).
 */
export async function signTenancyAgreementAction(input) {
	const parsed = SignSchema.parse(input);
	const result = await getAgreementByToken(parsed.token);
	if (!result) throw new Error("Agreement not found or token expired.");
	const { agreement, tenancy } = result;

	if (agreement.status === "cancelled") {
		throw new Error("This agreement has been cancelled. Contact the venue.");
	}

	if (agreement.status === "signed") {
		// Already signed; just return the next-step hint.
		return {
			ok: true,
			already_signed: true,
			next_url:
				tenancy.dd_token && !tenancy.direct_debit_ready_at
					? `/tenancy/${tenancy.dd_token}/direct-debit`
					: null,
		};
	}

	const hdrs = await headers();
	const ip =
		hdrs.get("x-forwarded-for")?.split(",")[0].trim() ||
		hdrs.get("x-real-ip") ||
		null;

	const signed = await updateAgreement(agreement.id, {
		status: "signed",
		signed_at: new Date(),
		signed_by_name: parsed.signed_by_name.trim(),
		signed_by_ip: ip,
	});

	revalidatePath(`/tenancy/agreement/${parsed.token}`);
	revalidatePath(`/admin/tenancies/${tenancy.id}`);

	await sendTenancyAgreementSignedEmail({
		tenancy,
		agreement: signed,
		contactEmail: tenancy.contact_email,
		contactFirstName: tenancy.contact_first_name,
	});

	return {
		ok: true,
		already_signed: false,
		next_url:
			tenancy.dd_token && !tenancy.direct_debit_ready_at
				? `/tenancy/${tenancy.dd_token}/direct-debit`
				: null,
	};
}
