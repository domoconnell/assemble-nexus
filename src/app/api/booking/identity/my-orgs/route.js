import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { contact } from "@/db/schema/entities/contact.js";
import { organisation } from "@/db/schema/entities/organisation.js";
import { organisation_contact } from "@/db/schema/entities/organisation_contact.js";
import { json } from "@/utils/auth/auth-guard.js";
import { getServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	const session = await getServerSession();
	if (!session?.user) return json(401, { error: "Unauthorised" });

	const venue = await requireCurrentVenue();

	const contacts = await db
		.select({ id: contact.id })
		.from(contact)
		.where(
			and(
				eq(contact.user_id, session.user.id),
				eq(contact.venue_id, venue.id),
				isNull(contact.deletedAt),
			),
		);

	if (contacts.length === 0) return json(200, { orgs: [] });

	const contactIds = contacts.map((c) => c.id);
	const rows = await db
		.select({
			id: organisation.id,
			name: organisation.name,
		})
		.from(organisation_contact)
		.innerJoin(organisation, eq(organisation_contact.organisation_id, organisation.id))
		.where(
			and(
				inArray(organisation_contact.contact_id, contactIds),
				eq(organisation.venue_id, venue.id),
				isNull(organisation.deletedAt),
			),
		);

	const seen = new Set();
	const orgs = [];
	for (const r of rows) {
		if (seen.has(r.id)) continue;
		seen.add(r.id);
		orgs.push(r);
	}

	return json(200, { orgs });
}
