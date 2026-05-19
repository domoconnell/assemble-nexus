import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getTenancyAgreementTemplate } from "@/db/queries/settings";
import AgreementEditor from "./_components/agreement-editor";

export const dynamic = "force-dynamic";

export default async function TenancyAgreementsSettingsPage() {
	const venue = await requireCurrentVenue();
	const template = await getTenancyAgreementTemplate(venue.id);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-4xl space-y-8">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Tenancy agreement</h1>
				<p className="text-sm text-muted-foreground mt-1 max-w-2xl">
					This is the template every new tenancy starts from. A snapshot is
					copied onto each tenancy at creation, so future edits here don&apos;t
					change agreements that have already been sent or signed.
				</p>
			</div>

			<section className="rounded-lg border border-dashed bg-muted/30 p-5 text-sm space-y-2">
				<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Merge variables
				</div>
				<p className="text-muted-foreground">
					Type these anywhere in the agreement and they&apos;ll be replaced when
					the tenant views their copy:
				</p>
				<ul className="grid gap-1 sm:grid-cols-2 text-xs font-mono pt-1">
					<li><code>{"{{venue_name}}"}</code> - venue&apos;s public name</li>
					<li><code>{"{{venue_address}}"}</code> - venue address (one line)</li>
					<li><code>{"{{organisation_name}}"}</code> - tenant organisation</li>
					<li><code>{"{{room_name}}"}</code> - leased room</li>
					<li><code>{"{{starts_on}}"}</code> - start date</li>
					<li><code>{"{{ends_on}}"}</code> - end date or &quot;ongoing&quot;</li>
					<li><code>{"{{monthly_rate}}"}</code> - GBP-formatted, private rentals</li>
					<li><code>{"{{per_session_rate}}"}</code> - GBP-formatted, recurring</li>
					<li><code>{"{{invoice_day_of_month}}"}</code> - billing day</li>
				</ul>
			</section>

			<AgreementEditor initialHtml={template?.html ?? ""} />
		</div>
	);
}
