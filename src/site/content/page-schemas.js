/**
 * Page CMS schemas - declare what's editable for each page. Pages read these
 * via `getPageContent(venueId, pageKey)` and fall back to code-level defaults
 * when a field isn't set.
 *
 * Field types:
 *   text        – single-line plain text
 *   longtext    – multi-line plain text (textarea)
 *   richtext    – Tiptap WYSIWYG (bold, italic, link, lists)
 *   image       – file upload; stored as file_id, resolved to public_url on read
 *   hue         – Tailwind hue gradient string for hero backgrounds
 *
 * Convention: hero titles + subtitles and any `body` field are richtext so
 * the user has formatting freedom. Short labels (kickers, button labels,
 * email addresses, single-line section titles outside the hero) stay plain
 * text since they only need one line.
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
					{ key: "subtitle", label: "Subtitle", type: "richtext" },
					{ key: "background_file_id", label: "Background image (optional)", type: "image" },
				],
			},
			{
				key: "rooms_section",
				label: "Rooms section",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "intro", label: "Intro paragraph", type: "richtext" },
				],
			},
			{
				key: "whats_on_section",
				label: "What's on section (auto-hidden when no events)",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "intro", label: "Intro paragraph", type: "richtext" },
				],
			},
			{
				key: "hire_section",
				label: "Hire CTA section",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "intro", label: "Intro paragraph", type: "richtext" },
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
					{ key: "title", label: "Title", type: "richtext" },
					{ key: "subtitle", label: "Subtitle", type: "richtext" },
				],
			},
			{
				key: "who_we_are",
				label: "Who we are",
				fields: [
					{ key: "kicker", label: "Kicker", type: "text" },
					{ key: "title", label: "Title", type: "text" },
					{ key: "intro", label: "Intro paragraph", type: "richtext" },
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
					{ key: "title", label: "Title", type: "richtext" },
					{ key: "subtitle", label: "Subtitle", type: "richtext" },
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
					{ key: "title", label: "Title", type: "richtext" },
					{ key: "subtitle", label: "Subtitle", type: "richtext" },
				],
			},
			{
				key: "empty_state",
				label: "Empty state (when nothing's on)",
				fields: [
					{ key: "title", label: "Title", type: "text" },
					{ key: "body", label: "Body", type: "richtext" },
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
					{ key: "title", label: "Title", type: "richtext" },
					{ key: "subtitle", label: "Subtitle", type: "richtext" },
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
					{ key: "title", label: "Title", type: "richtext" },
					{ key: "subtitle", label: "Subtitle", type: "richtext" },
				],
			},
			{
				key: "hire_block",
				label: "Hire enquiries block",
				fields: [
					{ key: "title", label: "Heading", type: "text" },
					{ key: "body", label: "Body", type: "richtext" },
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
