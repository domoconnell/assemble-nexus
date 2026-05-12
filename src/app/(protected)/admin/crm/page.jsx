import { requireCurrentVenue } from "@/db/queries/venue";
import { listOrganisationsWithBalances } from "@/db/queries/crm";
import CrmListClient from "./client";

export const dynamic = "force-dynamic";

export const metadata = { title: "CRM — Nexus" };

export default async function CrmListPage() {
	const venue = await requireCurrentVenue();
	const orgs = await listOrganisationsWithBalances(venue.id);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Organisations</h1>
				<p className="mt-1 text-sm text-muted-foreground max-w-2xl">
					Hirers and organisers you do ongoing business with. Each row shows
					their net position — what they owe the venue (open hire balances) and
					what the venue owes them (organiser net from tickets, after fees and
					expense payouts).
				</p>
			</div>
			<CrmListClient organisations={orgs} />
		</div>
	);
}
