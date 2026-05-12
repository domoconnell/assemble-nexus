import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/index.js";
import { site_content } from "@/db/schema/entities/site_content.js";
import { file } from "@/db/schema/entities/file.js";
import { getPageSchema } from "@/site/content/page-schemas.js";

/**
 * Read the saved content for a page and merge in any image-field URLs
 * resolved from `file_id` references. Returns an object keyed by section,
 * each section keyed by field. Empty fields are simply absent.
 *
 *   const content = await getPageContent(venue.id, "home");
 *   content.hero?.title           // "<p>The room...</p>"
 *   content.hero?.background_url  // "https://cdn..." (auto-resolved)
 */
export async function getPageContent(venueId, pageKey) {
	const [row] = await db
		.select()
		.from(site_content)
		.where(and(eq(site_content.venue_id, venueId), eq(site_content.page_key, pageKey)))
		.limit(1);
	const content = row?.content ?? {};

	const schema = getPageSchema(pageKey);
	if (!schema) return content;

	// Collect all image file_ids so we can resolve them in one query.
	const fileIds = [];
	for (const section of schema.sections) {
		const sectionContent = content[section.key];
		if (!sectionContent) continue;
		for (const field of section.fields) {
			if (field.type === "image") {
				const id = sectionContent[field.key];
				if (id) fileIds.push(id);
			}
		}
	}

	if (fileIds.length) {
		const files = await db
			.select({ id: file.id, public_url: file.public_url })
			.from(file)
			.where(inArray(file.id, fileIds));
		const urlById = new Map(files.map((f) => [f.id, f.public_url]));
		for (const section of schema.sections) {
			const sectionContent = content[section.key];
			if (!sectionContent) continue;
			for (const field of section.fields) {
				if (field.type === "image") {
					const id = sectionContent[field.key];
					if (id) {
						sectionContent[`${field.key}_url`] = urlById.get(id) ?? null;
					}
				}
			}
		}
	}

	return content;
}
