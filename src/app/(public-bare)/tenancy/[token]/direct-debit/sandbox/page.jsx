import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganisationByDdToken } from "@/db/queries/crm";
import { getVenueById } from "@/db/queries/venue";
import { getFakeSession } from "@/lib/tenancies/fake-dd";
import SandboxForm from "./_form";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "Direct debit · sandbox",
	robots: { index: false },
};

export default async function SandboxPage({ params, searchParams }) {
	const { token } = await params;
	const sp = await searchParams;
	const sessionId = typeof sp?.session_id === "string" ? sp.session_id : null;

	const org = await getOrganisationByDdToken(token);
	if (!org) notFound();

	const session = sessionId ? await getFakeSession(sessionId) : null;
	if (!session || session.organisation_id !== org.id) notFound();

	const venue = await getVenueById(org.venue_id);

	if (session.status === "cancelled") {
		return (
			<Shell venueName={venue?.name}>
				<div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
					<div className="font-medium text-destructive">Setup cancelled</div>
					<p className="text-muted-foreground mt-2">
						You cancelled this setup. You can start again from the link in your
						email, or contact the venue.
					</p>
					<Link
						href={`/tenancy/${token}/direct-debit`}
						className="text-xs underline mt-4 inline-block"
					>
						← Start again
					</Link>
				</div>
			</Shell>
		);
	}

	if (session.status === "complete") {
		return (
			<Shell venueName={venue?.name}>
				<div className="rounded-lg border bg-card p-6 text-sm">
					<div className="font-medium">This sandbox has already been completed.</div>
					<p className="text-muted-foreground mt-2">
						Use the link in your email to view the confirmation, or contact the
						venue if you didn&apos;t mean to do this.
					</p>
				</div>
			</Shell>
		);
	}

	return (
		<Shell venueName={venue?.name}>
			<div className="rounded-lg border bg-card p-6">
				<div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
					<div>
						<div className="text-[10px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5 inline-block mb-2">
							Sandbox · test mode
						</div>
						<h1 className="text-2xl font-semibold">Set up your direct debit</h1>
						<p className="text-sm text-muted-foreground mt-1">
							{venue?.name} - {org.name}
						</p>
					</div>
				</div>

				<SandboxForm
					sessionId={session.external_id}
					cancelHref={`/tenancy/${token}/direct-debit`}
					accountName={
						[org.contact_first_name, org.contact_last_name].filter(Boolean).join(" ") || ""
					}
				/>

				<DdGuaranteeBlock />
			</div>
		</Shell>
	);
}

function Shell({ venueName, children }) {
	return (
		<div className="min-h-screen bg-background py-10 px-4">
			<div className="mx-auto max-w-2xl space-y-4">
				<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					{venueName ?? "Venue"}
				</div>
				{children}
			</div>
		</div>
	);
}

function DdGuaranteeBlock() {
	return (
		<div className="mt-6 rounded-md border border-foreground/10 bg-muted/30 p-4 text-[11px] text-muted-foreground space-y-2 leading-relaxed">
			<div className="font-medium text-foreground">The Direct Debit Guarantee</div>
			<ul className="list-disc pl-4 space-y-1">
				<li>
					This Guarantee is offered by all banks and building societies that
					accept instructions to pay Direct Debits.
				</li>
				<li>
					If there are any changes to the amount, date or frequency of your
					Direct Debit, the venue will notify you 10 working days in advance of
					your account being debited.
				</li>
				<li>
					If an error is made in the payment of your Direct Debit, you are
					entitled to a full and immediate refund from your bank or building
					society.
				</li>
				<li>You can cancel a Direct Debit at any time by contacting your bank.</li>
			</ul>
			<div className="pt-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
				Sandbox notice: account numbers ending <strong>0000</strong> simulate a
				bank decline. Anything else succeeds.
			</div>
		</div>
	);
}
