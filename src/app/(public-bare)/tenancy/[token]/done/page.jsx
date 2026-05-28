import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrganisationByDdToken, updateOrganisationDd } from "@/db/queries/crm";
import { getActiveDdDriver } from "@/lib/tenancies/dd-driver";
import { sendOrganisationDdReadyEmail } from "@/utils/email/tenancy-emails";

export const dynamic = "force-dynamic";

export default async function DirectDebitDonePage({ params, searchParams }) {
	const { token } = await params;
	const sp = await searchParams;
	const sessionId = typeof sp?.session_id === "string" ? sp.session_id : null;

	const org = await getOrganisationByDdToken(token);
	if (!org) notFound();

	let outcome = "unknown";
	let errorMessage = null;

	if (org.direct_debit_ready_at) {
		outcome = "already_ready";
	} else if (sessionId) {
		try {
			const driver = await getActiveDdDriver(org.venue_id);
			const mandate = await driver.fetchSessionMandate(sessionId);
			if (mandate && mandate.payment_method_id) {
				const now = new Date();
				await updateOrganisationDd(org.id, {
					stripe_customer_id: mandate.customer_id,
					direct_debit_mandate_id: mandate.payment_method_id,
					direct_debit_ready_at: now,
				});
				outcome = "saved";
				await sendOrganisationDdReadyEmail({
					organisation: { ...org, direct_debit_ready_at: now },
					contactEmail: org.contact_email,
					contactFirstName: org.contact_first_name,
				});
			} else {
				outcome = "pending";
			}
		} catch (err) {
			outcome = "error";
			errorMessage = err.message;
		}
	} else {
		outcome = "missing_session";
	}

	return (
		<div className="min-h-screen bg-background py-10 px-4">
			<div className="mx-auto max-w-2xl rounded-lg border bg-card p-8 text-center space-y-4">
				{outcome === "saved" || outcome === "already_ready" ? (
					<>
						<div className="text-xs uppercase tracking-[0.22em] text-primary">
							Direct debit ready
						</div>
						<h1 className="text-2xl font-semibold">All set.</h1>
						<p className="text-sm text-muted-foreground">
							Your direct debit mandate is in place. We&apos;ll automatically
							collect each month&apos;s invoice - no further action needed from you.
						</p>
					</>
				) : outcome === "pending" ? (
					<>
						<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							Awaiting confirmation
						</div>
						<h1 className="text-2xl font-semibold">Hang tight.</h1>
						<p className="text-sm text-muted-foreground">
							Your mandate is being processed. Refresh in a few minutes - if it
							still isn&apos;t ready, contact the venue and we&apos;ll sort it.
						</p>
					</>
				) : (
					<>
						<div className="text-xs uppercase tracking-[0.22em] text-destructive">
							Something went wrong
						</div>
						<h1 className="text-2xl font-semibold">We couldn&apos;t finalise setup</h1>
						<p className="text-sm text-muted-foreground">
							{errorMessage || "Please try again, or contact us if it persists."}
						</p>
						<Link
							href={`/tenancy/${token}/direct-debit`}
							className="inline-block rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
						>
							Try again
						</Link>
					</>
				)}
			</div>
		</div>
	);
}
