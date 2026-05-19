import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { getTenancyByDdToken } from "@/db/queries/tenancies";
import { getVenueById } from "@/db/queries/venue";
import { getActiveDdDriver } from "@/lib/tenancies/dd-driver";

export const dynamic = "force-dynamic";

export default async function DirectDebitSetupPage({ params }) {
	const { token } = await params;
	const t = await getTenancyByDdToken(token);
	if (!t) notFound();

	if (t.direct_debit_ready_at) {
		return (
			<div className="min-h-screen bg-background py-10 px-4">
				<div className="mx-auto max-w-2xl rounded-lg border bg-card p-8 text-center space-y-4">
					<div className="text-xs uppercase tracking-[0.22em] text-primary">
						Direct debit ready
					</div>
					<h1 className="text-2xl font-semibold">All set.</h1>
					<p className="text-sm text-muted-foreground">
						Your direct debit is in place. We&apos;ll automatically debit on each
						month&apos;s invoice date - you don&apos;t need to do anything else.
					</p>
				</div>
			</div>
		);
	}

	const venue = await getVenueById(t.venue_id);
	const hdrs = await headers();
	const proto = hdrs.get("x-forwarded-proto") || "https";
	const host = hdrs.get("host") || "localhost:3000";
	const origin = `${proto}://${host}`;

	let session;
	try {
		const driver = await getActiveDdDriver(t.venue_id);
		session = await driver.createBacsDdSession({
			tenancy: t,
			tenantEmail: t.contact_email || "",
			successUrl: `${origin}/tenancy/${token}/done?session_id={CHECKOUT_SESSION_ID}`,
			cancelUrl: `${origin}/tenancy/${token}/direct-debit`,
			origin,
		});
	} catch (err) {
		return (
			<div className="min-h-screen bg-background py-10 px-4">
				<div className="mx-auto max-w-2xl rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
					<div className="font-medium text-destructive">
						Direct debit setup isn&apos;t available yet
					</div>
					<p className="text-muted-foreground mt-2">
						{err.message}. Please contact {venue?.name ?? "the venue"} - we&apos;ll
						sort the payment setup manually.
					</p>
					<Link
						href={`/tenancy/${token}/direct-debit`}
						className="text-xs text-muted-foreground underline mt-4 inline-block"
					>
						← Try again
					</Link>
				</div>
			</div>
		);
	}

	redirect(session.url);
}
