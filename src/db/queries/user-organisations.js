import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { contact } from "@/db/schema/entities/contact.js";
import { organisation } from "@/db/schema/entities/organisation.js";
import { organisation_contact } from "@/db/schema/entities/organisation_contact.js";

/**
 * Organisations the given user is a contact for. Used by the /my-events
 * portal so users can see (and switch between) the orgs they belong to.
 */
export async function listOrganisationsForUser(userId) {
	return db
		.selectDistinct({
			id: organisation.id,
			name: organisation.name,
			kind: organisation.kind,
			role: organisation_contact.role,
		})
		.from(organisation_contact)
		.innerJoin(contact, eq(contact.id, organisation_contact.contact_id))
		.innerJoin(organisation, eq(organisation.id, organisation_contact.organisation_id))
		.where(
			and(
				eq(contact.user_id, userId),
				isNull(contact.deletedAt),
				isNull(organisation.deletedAt),
			),
		)
		.orderBy(asc(organisation.name));
}
