import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { customer } from "@/db/schema/entities/customer.js";
import { room } from "@/db/schema/entities/room.js";
import { requireCurrentVenue } from "@/db/queries/venue";
import TenancyForm from "../_components/tenancy-form";

export const dynamic = "force-dynamic";

export default async function NewTenancyPage() {
	const venue = await requireCurrentVenue();

	const customers = await db
		.select({
			id: customer.id,
			first_name: customer.first_name,
			last_name: customer.last_name,
			email: customer.email,
			organisation: customer.organisation,
		})
		.from(customer)
		.where(isNull(customer.deletedAt))
		.orderBy(asc(customer.first_name), asc(customer.last_name));

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
			</div>
			<TenancyForm customers={customers} rooms={rooms} />
		</div>
	);
}
