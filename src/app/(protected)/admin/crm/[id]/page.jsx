import Link from "next/link";
import { notFound } from "next/navigation";
import {
	getOrganisationById,
	listContactsForOrganisation,
	listBookingsForOrganisation,
	listEventsForOrganisation,
	listTicketOrdersForOrganisation,
	listExpensesForOrganisation,
	listOrganisationsWithBalances,
} from "@/db/queries/crm";
import { requireCurrentVenue } from "@/db/queries/venue";
import OrganisationDetailClient from "./client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
	const { id } = await params;
	const o = await getOrganisationById(id);
	return { title: o ? `${o.name} — CRM` : "CRM" };
}

export default async function OrganisationDetailPage({ params }) {
	const { id } = await params;
	const org = await getOrganisationById(id);
	if (!org) notFound();

	const venue = await requireCurrentVenue();

	const [contacts, bookings, events, ticketOrders, expenses, allWithBalances] = await Promise.all([
		listContactsForOrganisation(org.id),
		listBookingsForOrganisation(org.id),
		listEventsForOrganisation(org.id),
		listTicketOrdersForOrganisation(org.id),
		listExpensesForOrganisation(org.id),
		listOrganisationsWithBalances(venue.id),
	]);

	const balance = allWithBalances.find((o) => o.id === org.id) ?? {
		they_owe_us_cents: 0,
		we_owe_them_cents: 0,
	};

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-6">
			<div>
				<Link href="/admin/crm" className="text-sm text-muted-foreground hover:text-foreground">
					← All organisations
				</Link>
				<div className="mt-2 flex items-baseline justify-between gap-4 flex-wrap">
					<div>
						<h1 className="text-2xl font-semibold">{org.name}</h1>
						<p className="mt-1 text-sm text-muted-foreground capitalize">{org.kind}</p>
					</div>
				</div>
			</div>

			<OrganisationDetailClient
				organisation={org}
				balance={balance}
				contacts={contacts}
				bookings={bookings}
				events={events}
				ticketOrders={ticketOrders}
				expenses={expenses}
			/>
		</div>
	);
}
