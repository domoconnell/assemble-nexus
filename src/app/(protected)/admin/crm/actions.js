"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/index.js";
import { organisation, ORGANISATION_KINDS } from "@/db/schema/entities/organisation.js";
import { contact } from "@/db/schema/entities/contact.js";
import { organisation_contact, ORGANISATION_CONTACT_ROLES } from "@/db/schema/entities/organisation_contact.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";

async function gate() {
	return requireServerSession();
}

function nullify(v) {
	return v === "" || v === undefined ? null : v;
}

const OrganisationSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	name: z.string().min(1).max(200),
	kind: z.enum(ORGANISATION_KINDS).default("other"),
	notes: z.string().max(2000).optional().nullable(),
});

export async function saveOrganisationAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = OrganisationSchema.parse({
		...input,
		notes: nullify(input.notes),
	});
	const values = {
		venue_id: venue.id,
		name: parsed.name.trim(),
		kind: parsed.kind,
		notes: parsed.notes,
	};
	if (parsed.id) {
		await db
			.update(organisation)
			.set(values)
			.where(and(eq(organisation.id, parsed.id), eq(organisation.venue_id, venue.id)));
		revalidatePath("/admin/crm");
		revalidatePath(`/admin/crm/${parsed.id}`);
		return { id: parsed.id };
	}
	const [inserted] = await db
		.insert(organisation)
		.values(values)
		.returning({ id: organisation.id });
	revalidatePath("/admin/crm");
	return { id: inserted.id };
}

export async function deleteOrganisationAction(id) {
	await gate();
	const venue = await requireCurrentVenue();
	await db
		.update(organisation)
		.set({ deletedAt: new Date() })
		.where(and(eq(organisation.id, id), eq(organisation.venue_id, venue.id)));
	revalidatePath("/admin/crm");
	return { ok: true };
}

const ContactSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	organisation_id: z.string().uuid(),
	first_name: z.string().min(1).max(120),
	last_name: z.string().max(120).optional().nullable(),
	email: z.string().email().max(254).optional().nullable(),
	phone: z.string().max(80).optional().nullable(),
	notes: z.string().max(2000).optional().nullable(),
	role: z.enum(ORGANISATION_CONTACT_ROLES).default("other"),
});

export async function saveContactAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = ContactSchema.parse({
		...input,
		last_name: nullify(input.last_name),
		email: nullify(input.email),
		phone: nullify(input.phone),
		notes: nullify(input.notes),
	});

	let contactId = parsed.id;
	if (parsed.id) {
		await db
			.update(contact)
			.set({
				first_name: parsed.first_name,
				last_name: parsed.last_name,
				email: parsed.email,
				phone: parsed.phone,
				notes: parsed.notes,
			})
			.where(and(eq(contact.id, parsed.id), eq(contact.venue_id, venue.id)));
	} else {
		const [inserted] = await db
			.insert(contact)
			.values({
				venue_id: venue.id,
				first_name: parsed.first_name,
				last_name: parsed.last_name,
				email: parsed.email,
				phone: parsed.phone,
				notes: parsed.notes,
			})
			.returning({ id: contact.id });
		contactId = inserted.id;
	}

	// Upsert the org<->contact link.
	const [existingLink] = await db
		.select()
		.from(organisation_contact)
		.where(
			and(
				eq(organisation_contact.organisation_id, parsed.organisation_id),
				eq(organisation_contact.contact_id, contactId),
			),
		)
		.limit(1);
	if (existingLink) {
		await db
			.update(organisation_contact)
			.set({ role: parsed.role })
			.where(
				and(
					eq(organisation_contact.organisation_id, parsed.organisation_id),
					eq(organisation_contact.contact_id, contactId),
				),
			);
	} else {
		await db
			.insert(organisation_contact)
			.values({
				organisation_id: parsed.organisation_id,
				contact_id: contactId,
				role: parsed.role,
			});
	}

	// Promote first contact to primary if org has none.
	const [org] = await db
		.select({ primary: organisation.primary_contact_id })
		.from(organisation)
		.where(eq(organisation.id, parsed.organisation_id))
		.limit(1);
	if (org && !org.primary) {
		await db
			.update(organisation)
			.set({ primary_contact_id: contactId })
			.where(eq(organisation.id, parsed.organisation_id));
	}

	revalidatePath(`/admin/crm/${parsed.organisation_id}`);
	return { id: contactId };
}

export async function removeContactFromOrganisationAction({ organisation_id, contact_id }) {
	await gate();
	await db
		.delete(organisation_contact)
		.where(
			and(
				eq(organisation_contact.organisation_id, organisation_id),
				eq(organisation_contact.contact_id, contact_id),
			),
		);
	revalidatePath(`/admin/crm/${organisation_id}`);
	return { ok: true };
}
