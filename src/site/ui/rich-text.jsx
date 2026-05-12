/**
 * Tiny renderer for stored HTML from the CMS richtext field. Trusts the
 * source (admin-authored) but wraps in a `prose` container for typography
 * defaults. We deliberately don't sanitize here because only admins write it
 * — the WYSIWYG component constrains the allowed tags upstream.
 */
export function RichText({ html, className = "" }) {
	if (!html) return null;
	return (
		<div
			className={className}
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
