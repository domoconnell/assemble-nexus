"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/index.js";
import { site_content } from "@/db/schema/entities/site_content.js";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { getPageSchema } from "@/site/content/page-schemas.js";

async function gate() {
	return requireServerSession();
}

const SaveSchema = z.object({
	page_key: z.string().min(1).max(60),
	content: z.record(z.string(), z.record(z.string(), z.any())),
});

/**
 * Upsert a page's content for the current venue. We validate that each
 * section.field present in the submitted blob exists in the page schema -
 * unknown fields are silently dropped.
 */
export async function savePageContentAction(input) {
	await gate();
	const venue = await requireCurrentVenue();
	const parsed = SaveSchema.parse(input);

	const schema = getPageSchema(parsed.page_key);
	if (!schema) throw new Error(`Unknown page: ${parsed.page_key}`);

	const sectionKeys = new Set(schema.sections.map((s) => s.key));
	const fieldsBySection = new Map(
		schema.sections.map((s) => [s.key, new Set(s.fields.map((f) => f.key))]),
	);

	const clean = {};
	for (const [sectionKey, sectionContent] of Object.entries(parsed.content)) {
		if (!sectionKeys.has(sectionKey)) continue;
		const allowed = fieldsBySection.get(sectionKey);
		const cleanSection = {};
		for (const [fieldKey, fieldValue] of Object.entries(sectionContent)) {
			if (!allowed.has(fieldKey)) continue;
			// Drop empty strings and nulls so the page falls back to defaults.
			if (fieldValue === "" || fieldValue === null || fieldValue === undefined) continue;
			cleanSection[fieldKey] = fieldValue;
		}
		if (Object.keys(cleanSection).length > 0) {
			clean[sectionKey] = cleanSection;
		}
	}

	const [existing] = await db
		.select({ id: site_content.id })
		.from(site_content)
		.where(
			and(
				eq(site_content.venue_id, venue.id),
				eq(site_content.page_key, parsed.page_key),
			),
		)
		.limit(1);

	if (existing) {
		await db
			.update(site_content)
			.set({ content: clean })
			.where(eq(site_content.id, existing.id));
	} else {
		await db.insert(site_content).values({
			venue_id: venue.id,
			page_key: parsed.page_key,
			content: clean,
		});
	}

	revalidatePath(schema.path ?? "/");
	revalidatePath("/admin/cms");
	return { ok: true };
}
