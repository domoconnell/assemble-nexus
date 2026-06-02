import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { organisation } from "@/db/schema/entities/organisation.js";
import { contact } from "@/db/schema/entities/contact.js";
import { room } from "@/db/schema/entities/room.js";
import { requireCurrentVenue } from "@/db/queries/venue";
import { listRoomRackHourlyRates } from "@/db/queries/room-rack-rates.js";
import TenancyForm from "../_components/tenancy-form";

export const dynamic = "force-dynamic";

export default async function NewTenancyPage() {
	const venue = await requireCurrentVenue();

	const orgs = await db
		.select({
			id: organisation.id,
			name: organisation.name,
			primary_contact_id: organisation.primary_contact_id,
			primary_contact_name: contact.first_name,
			primary_contact_email: contact.email,
			dd_token: organisation.dd_token,
			direct_debit_ready_at: organisation.direct_debit_ready_at,
		})
		.from(organisation)
		.leftJoin(contact, eq(contact.id, organisation.primary_contact_id))
		.where(and(eq(organisation.venue_id, venue.id), isNull(organisation.deletedAt)))
		.orderBy(asc(organisation.name));

	const rooms = await db
		.select({
			id: room.id,
			name: room.name,
			is_public: room.is_public,
			is_published: room.is_published,
		})
		.from(room)
		.where(and(eq(room.venue_id, venue.id), isNull(room.deletedAt)))
		.orderBy(asc(room.sort_order), asc(room.name));

	const roomRackRates = await listRoomRackHourlyRates(venue.id);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-6">
			<div>
				<Link
					href="/admin/tenancies"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Tenancies
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">New tenancy</h1>
				{orgs.length === 0 && (
					<p className="text-sm text-muted-foreground mt-2">
						You need at least one organisation in the CRM before creating a tenancy.{" "}
						<Link href="/admin/crm" className="underline">
							Open CRM →
						</Link>
					</p>
				)}
			</div>
			<TenancyForm organisations={orgs} rooms={rooms} roomRackRates={roomRackRates} />
		</div>
	);
}
