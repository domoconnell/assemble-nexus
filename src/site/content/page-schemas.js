/**
 * Page CMS schemas — declare what's editable for each page. Pages read these
 * via `getPageContent(venueId, pageKey)` and fall back to code-level defaults
 * when a field isn't set.
 *
 * Field types:
 *   text        – single-line plain text
 *   longtext    – multi-line plain text (textarea)
 *   richtext    – tiny WYSIWYG (bold, italic, link, br)
 *   image       – file upload; stored as file_id, resolved to public_url on read
 *   hue         – Tailwind hue gradient string for hero backgrounds
 */

export const PAGE_SCHEMAS = {
	home: {
		label: "Home",
		path: "/",
		sections: [
			{
				key: "hero",
				label: "Hero",
				fields: [
					{ key: "kicker", label: "Kicker (small text above title)", type: "text" },
					{ key: "title", label: "Title", type: "richtext" },
					{ key: "subtitle", label: "Subtitle", type: "longtext" },
					{ key: "background_file_id", label: "Background image (optional)", type: "image" },
				],
			},
			{
				key: "rooms_section",
				label: "Rooms section",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "intro", label: "Intro paragraph", type: "longtext" },
				],
			},
			{
				key: "whats_on_section",
				label: "What's on section (auto-hidden when no events)",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "intro", label: "Intro paragraph", type: "longtext" },
				],
			},
			{
				key: "hire_section",
				label: "Hire CTA section",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "intro", label: "Intro paragraph", type: "longtext" },
					{ key: "cta_label", label: "Button label", type: "text" },
				],
			},
		],
	},

	about: {
		label: "About",
		path: "/about",
		sections: [
			{
				key: "hero",
				label: "Hero",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "subtitle", label: "Subtitle", type: "longtext" },
				],
			},
			{
				key: "who_we_are",
				label: "Who we are",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "intro", label: "Intro paragraph", type: "longtext" },
					{ key: "body", label: "Body copy", type: "richtext" },
				],
			},
			{
				key: "location",
				label: "Find us",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "body", label: "Body copy", type: "richtext" },
				],
			},
			{
				key: "cafe",
				label: "Café",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "body", label: "Body copy", type: "richtext" },
				],
			},
			{
				key: "accessibility",
				label: "Accessibility",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "body", label: "Body copy", type: "richtext" },
				],
			},
		],
	},

	rooms: {
		label: "Rooms overview",
		path: "/rooms",
		sections: [
			{
				key: "hero",
				label: "Hero",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "subtitle", label: "Subtitle", type: "longtext" },
				],
			},
		],
	},

	whats_on: {
		label: "What's On",
		path: "/whats-on",
		sections: [
			{
				key: "hero",
				label: "Hero",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "subtitle", label: "Subtitle", type: "longtext" },
				],
			},
			{
				key: "empty_state",
				label: "Empty state (when nothing's on)",
				fields: [
					{ key: "title", label: "Title", type: "text" },
					{ key: "body", label: "Body", type: "longtext" },
				],
			},
		],
	},

	book: {
		label: "Book",
		path: "/book",
		sections: [
			{
				key: "hero",
				label: "Hero",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "subtitle", label: "Subtitle", type: "longtext" },
				],
			},
		],
	},

	contact: {
		label: "Contact",
		path: "/contact",
		sections: [
			{
				key: "hero",
				label: "Hero",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "subtitle", label: "Subtitle", type: "longtext" },
				],
			},
			{
				key: "hire_block",
				label: "Hire enquiries block",
				fields: [
					{ key: "title", label: "Heading", type: "text" },
					{ key: "body", label: "Body", type: "longtext" },
					{ key: "cta_label", label: "Button label", type: "text" },
				],
			},
			{
				key: "general",
				label: "General contact",
				fields: [
					{ key: "title", label: "Heading", type: "text" },
					{ key: "email", label: "Email address", type: "text" },
				],
			},
			{
				key: "press",
				label: "Press contact",
				fields: [
					{ key: "title", label: "Heading", type: "text" },
					{ key: "email", label: "Email address", type: "text" },
				],
			},
		],
	},
};

export function getPageSchema(pageKey) {
	return PAGE_SCHEMAS[pageKey] ?? null;
}
