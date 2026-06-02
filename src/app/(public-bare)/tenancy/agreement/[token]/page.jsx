import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgreementByToken, listLinesForTenancy } from "@/db/queries/tenancies";
import { getVenueById } from "@/db/queries/venue";
import { buildAgreementVars, renderAgreementHtml } from "@/lib/tenancies/agreement";
import SignButton from "./_sign-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
	const { token } = await params;
	const result = await getAgreementByToken(token);
	if (!result) return { title: "Tenancy agreement" };
	return {
		title: `Tenancy agreement · ${result.tenancy.organisation_name ?? ""}`,
		robots: { index: false },
	};
}

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
	timeZone: "Europe/London",
});

export default async function AgreementPage({ params }) {
	const { token } = await params;
	const result = await getAgreementByToken(token);
	if (!result) notFound();
	const { agreement, tenancy } = result;
	const venue = await getVenueById(tenancy.venue_id);
	const lines = await listLinesForTenancy(tenancy.id);
	const renderedHtml = renderAgreementHtml(
		agreement.html ?? "",
		buildAgreementVars({ tenancy, venue, lines }),
	);
	const roomNames = Array.from(
		new Set(lines.map((l) => l.room_name).filter(Boolean)),
	).join(", ");
	const signed = !!agreement.signed_at;
	const cancelled = agreement.status === "cancelled";
	const expired =
		!signed &&
		!cancelled &&
		agreement.expires_at &&
		new Date(agreement.expires_at) < new Date();
	const needsDd = tenancy.org_dd_token && !tenancy.org_direct_debit_ready_at;

	return (
		<div className="min-h-screen bg-background py-10 px-4">
			<div className="mx-auto max-w-3xl space-y-6">
				<div className="rounded-lg border bg-card p-6">
					<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Tenancy agreement
					</div>
					<h1 className="text-2xl font-semibold mt-2">{venue?.name ?? ""}</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{tenancy.organisation_name}
						{roomNames && <> · {roomNames}</>}
					</p>
				</div>

				{cancelled && (
					<div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
						<div className="font-medium text-destructive">This agreement has been cancelled</div>
						<div className="text-muted-foreground mt-1">
							{agreement.cancelled_reason || "The venue has cancelled this agreement. Please contact them if you have any questions."}
						</div>
					</div>
				)}

				{expired && (
					<div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
						<div className="font-medium text-destructive">This sign link has expired</div>
						<div className="text-muted-foreground mt-1">
							For your safety the link expires 30 days after it was sent.
							Get in touch with {venue?.name ?? "the venue"} and we&apos;ll
							send you a fresh one.
						</div>
					</div>
				)}

				{signed && !cancelled && (
					<div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
						<div className="font-medium text-primary">Signed</div>
						<div className="text-muted-foreground mt-1">
							Signed by {agreement.signed_by_name} on{" "}
							{dateTimeFmt.format(new Date(agreement.signed_at))}.
						</div>
						{needsDd && (
							<div className="mt-4">
								<Link
									href={`/tenancy/${tenancy.org_dd_token}/direct-debit`}
									className="inline-block rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
								>
									Continue to direct debit setup →
								</Link>
							</div>
						)}
					</div>
				)}

				<article
					className="rounded-lg border bg-card p-8 prose dark:prose-invert max-w-none leading-relaxed [&_p]:my-4 [&_ul]:my-4 [&_ol]:my-4 [&_li]:my-1 [&_h1]:mt-8 [&_h2]:mt-8 [&_h3]:mt-6"
					dangerouslySetInnerHTML={{ __html: renderedHtml }}
				/>

				{!signed && !cancelled && !expired && (
					<SignButton
						token={token}
						chainTo={needsDd ? `/tenancy/${tenancy.org_dd_token}/direct-debit` : null}
					/>
				)}
			</div>
		</div>
	);
}
