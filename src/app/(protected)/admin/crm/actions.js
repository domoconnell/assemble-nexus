"use server";

import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/index.js";
import { organisation, ORGANISATION_KINDS } from "@/db/schema/entities/organisation.js";
import { contact } from "@/db/schema/entities/contact.js";
import { organisation_contact, ORGANISATION_CONTACT_ROLES } from "@/db/schema/entities/organisation_contact.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { getOrganisationWithContact, updateOrganisationDd } from "@/db/queries/crm.js";
import { getStripeSettings } from "@/db/queries/settings.js";
import { sendOrganisationDdSetupEmail } from "@/utils/email/tenancy-emails.js";

function newToken() {
	return randomBytes(24).toString("base64url");
}

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
	// New orgs get a stable Direct Debit setup token up front - the public
	// `/tenancy/[token]/direct-debit` page resolves orgs by this token so
	// it must exist before any tenancy is created against the org.
	const [inserted] = await db
		.insert(organisation)
		.values({ ...values, dd_token: newToken() })
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

/* ------------------------------------------------------------------------ */
/* Direct Debit (mandate lives on the organisation)                          */
/* ------------------------------------------------------------------------ */

/**
 * Email the org's primary contact a public link to set up the Direct
 * Debit mandate. Refuses if there's no contact email or the mandate is
 * already in place. Back-fills `dd_token` for orgs created before the
 * column existed so staff don't have to re-create them.
 */
export async function sendOrganisationDdSetupEmailAction(organisationId) {
	await gate();
	const venue = await requireCurrentVenue();
	const org = await getOrganisationWithContact(organisationId);
	if (!org || org.venue_id !== venue.id) throw new Error("Organisation not found.");
	if (!org.contact_email) {
		throw new Error(
			"No contact email on this organisation. Add a primary contact in the CRM first.",
		);
	}
	if (org.direct_debit_ready_at) {
		throw new Error("This organisation already has an active direct debit.");
	}
	let dd_token = org.dd_token;
	if (!dd_token) {
		dd_token = newToken();
		await updateOrganisationDd(org.id, { dd_token });
	}
	await sendOrganisationDdSetupEmail({
		organisation: { ...org, dd_token },
		contactEmail: org.contact_email,
		contactFirstName: org.contact_first_name,
	});
	revalidatePath(`/admin/crm/${org.id}`);
	return { ok: true };
}

/**
 * Detach the saved DD mandate from an organisation so a fresh one can be
 * set up. Best-effort attempts to detach the payment method at Stripe so
 * the same account can't be silently re-charged outside Nexus. Keeps
 * `dd_token` so the public setup link stays stable.
 */
export async function removeOrganisationDdMandateAction(organisationId) {
	await gate();
	const venue = await requireCurrentVenue();
	const org = await getOrganisationWithContact(organisationId);
	if (!org || org.venue_id !== venue.id) throw new Error("Organisation not found.");
	if (!org.direct_debit_mandate_id && !org.direct_debit_ready_at) {
		return { ok: true, already: true };
	}

	if (org.direct_debit_mandate_id && String(org.direct_debit_mandate_id).startsWith("pm_")) {
		try {
			const psp = await getStripeSettings(org.venue_id);
			const secretKey = psp?.secret_key;
			if (secretKey) {
				await fetch(
					`https://api.stripe.com/v1/payment_methods/${encodeURIComponent(org.direct_debit_mandate_id)}/detach`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${secretKey}`,
							Accept: "application/json",
						},
						cache: "no-store",
					},
				);
			}
		} catch (err) {
			console.error("[org.removeDd] stripe detach failed", err);
		}
	}

	await updateOrganisationDd(org.id, {
		direct_debit_mandate_id: null,
		stripe_customer_id: null,
		direct_debit_ready_at: null,
	});
	revalidatePath(`/admin/crm/${org.id}`);
	return { ok: true };
}
