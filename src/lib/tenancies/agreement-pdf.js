import path from "node:path";
import React from "react";
import {
	Document,
	Page,
	View,
	Text,
	StyleSheet,
	Font,
	renderToBuffer,
} from "@react-pdf/renderer";

// Register Caveat once per process so the signature block matches the
// cursive style on the web sign page. Lives at public/fonts/.
let _fontsRegistered = false;
function ensureFonts() {
	if (_fontsRegistered) return;
	Font.register({
		family: "Caveat",
		src: path.join(process.cwd(), "public", "fonts", "Caveat-Regular.ttf"),
	});
	_fontsRegistered = true;
}

/**
 * Render a signed tenancy agreement to a PDF Buffer for emailing as an
 * attachment. The agreement HTML uses a small, controlled subset of
 * tags (the rich-text editor in /admin/settings/tenancy-agreements
 * emits only these): p, strong/b, em/i, ol, ul, li.
 *
 * We tokenise that subset and emit @react-pdf primitives, matching the
 * project's pattern for ticket / invoice / board-pack PDFs - no new
 * runtime dependency.
 */

const styles = StyleSheet.create({
	page: {
		padding: 56,
		fontFamily: "Helvetica",
		fontSize: 10.5,
		color: "#0f172a",
		lineHeight: 1.55,
	},
	header: {
		marginBottom: 18,
		paddingBottom: 14,
		borderBottomWidth: 1,
		borderBottomColor: "#e2e8f0",
	},
	kicker: { fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: "#64748b" },
	venue: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 4 },
	sub: { color: "#475569", marginTop: 2 },
	paragraph: { marginBottom: 6 },
	spacer: { height: 6 },
	listRow: { flexDirection: "row", marginBottom: 4 },
	marker: { width: 22 },
	listChild: { flex: 1 },
	signatureBox: {
		marginTop: 28,
		borderWidth: 1.5,
		borderColor: "#cbd5e1",
		borderStyle: "dashed",
		borderRadius: 6,
		paddingTop: 18,
		paddingBottom: 12,
		paddingHorizontal: 20,
	},
	signatureName: {
		fontFamily: "Caveat",
		fontSize: 34,
		color: "#0f172a",
		marginBottom: 6,
	},
	signatureRule: {
		borderTopWidth: 1,
		borderTopColor: "#cbd5e1",
		marginTop: 6,
		paddingTop: 6,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	signatureMeta: {
		fontSize: 8,
		letterSpacing: 2,
		textTransform: "uppercase",
		color: "#64748b",
	},
	signatureFootnote: {
		marginTop: 10,
		fontSize: 8,
		color: "#94a3b8",
	},
	footer: {
		position: "absolute",
		bottom: 24,
		left: 56,
		right: 56,
		fontSize: 8,
		color: "#94a3b8",
		textAlign: "center",
	},
});

const KNOWN_TAGS = new Set(["p", "strong", "em", "b", "i", "ol", "ul", "li", "br"]);

function decodeEntities(s) {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ")
		.replace(/&apos;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"');
}

function* tokenize(html) {
	const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>/g;
	let last = 0;
	let m;
	while ((m = tagRe.exec(html)) !== null) {
		if (m.index > last) {
			yield { type: "text", value: decodeEntities(html.slice(last, m.index)) };
		}
		const name = m[1].toLowerCase();
		const isClose = html[m.index + 1] === "/";
		if (KNOWN_TAGS.has(name)) {
			if (name === "br") yield { type: "text", value: "\n" };
			else yield { type: isClose ? "close" : "open", name };
		}
		last = m.index + m[0].length;
	}
	if (last < html.length) {
		yield { type: "text", value: decodeEntities(html.slice(last)) };
	}
}

function parse(html) {
	const root = { tag: "root", children: [] };
	const stack = [root];
	for (const tok of tokenize(html)) {
		const top = stack[stack.length - 1];
		if (tok.type === "open") {
			const node = { tag: tok.name, children: [] };
			top.children.push(node);
			stack.push(node);
		} else if (tok.type === "close") {
			while (stack.length > 1 && stack[stack.length - 1].tag !== tok.name) {
				stack.pop();
			}
			if (stack.length > 1) stack.pop();
		} else {
			top.children.push({ text: tok.value });
		}
	}
	return root;
}

const INLINE_TAGS = new Set(["strong", "b", "em", "i"]);

function renderInline(node, key) {
	if (node.text !== undefined) return node.text;
	if (!INLINE_TAGS.has(node.tag)) {
		// Unknown inline node: flatten children textually.
		return node.children?.map?.((c, i) => renderInline(c, i)) ?? "";
	}
	const bold = node.tag === "strong" || node.tag === "b";
	const italic = node.tag === "em" || node.tag === "i";
	const font = bold && italic
		? "Helvetica-BoldOblique"
		: bold
			? "Helvetica-Bold"
			: italic
				? "Helvetica-Oblique"
				: "Helvetica";
	return React.createElement(
		Text,
		{ key, style: { fontFamily: font } },
		node.children.map((c, i) => renderInline(c, i)),
	);
}

function isEmptyParagraph(node) {
	if (node.tag !== "p") return false;
	if (node.children.length === 0) return true;
	return node.children.every((c) => {
		if (c.text !== undefined) return c.text.trim() === "";
		return false;
	});
}

/**
 * The rich-text editor that produces the agreement HTML often leaves a
 * trailing empty list item (`<li><p></p></li>`) at the end of every list
 * as a typing placeholder. Filter those out so the PDF doesn't show
 * orphan numbers like "4." with no content next to them.
 */
function isEmptyLi(node) {
	if (node.tag !== "li") return false;
	if (node.children.length === 0) return true;
	return node.children.every((c) => {
		if (c.text !== undefined) return c.text.trim() === "";
		if (c.tag === "p") return isEmptyParagraph(c);
		return false;
	});
}

function renderBlock(node, key) {
	if (node.tag === "p") {
		if (isEmptyParagraph(node)) {
			return React.createElement(View, { key, style: styles.spacer });
		}
		return React.createElement(
			View,
			{ key, style: styles.paragraph },
			React.createElement(Text, null, node.children.map((c, i) => renderInline(c, i))),
		);
	}
	if (node.tag === "ol" || node.tag === "ul") {
		const items = node.children.filter((c) => c.tag === "li" && !isEmptyLi(c));
		return React.createElement(
			View,
			{ key, style: { marginBottom: 6 } },
			items.map((li, i) => {
				const marker = node.tag === "ol" ? `${i + 1}.` : "•";
				return React.createElement(
					View,
					{ key: i, style: styles.listRow },
					React.createElement(
						View,
						{ style: styles.marker },
						React.createElement(Text, null, marker),
					),
					React.createElement(
						View,
						{ style: styles.listChild },
						renderBlocks(li.children),
					),
				);
			}),
		);
	}
	if (node.tag === "li") {
		// Bare <li> outside of a list shouldn't happen but render anyway.
		return React.createElement(View, { key }, renderBlocks(node.children));
	}
	// Unknown / inline at block level: wrap in a paragraph.
	return React.createElement(
		View,
		{ key, style: styles.paragraph },
		React.createElement(Text, null, renderInline(node, 0)),
	);
}

function renderBlocks(children) {
	const out = [];
	let key = 0;
	for (const c of children) {
		if (c.text !== undefined) {
			if (c.text.trim() === "") continue;
			out.push(React.createElement(Text, { key: key++ }, c.text));
			continue;
		}
		out.push(renderBlock(c, key++));
	}
	return out;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	dateStyle: "long",
	timeZone: "Europe/London",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

/**
 * Faux-signature block that mirrors the web sign page: the signed name
 * in a Caveat cursive face, a rule, "Signed by" + the signed date, plus
 * a small footnote with the IP and timestamp for the audit trail.
 */
function renderSignatureBlock(agreement) {
	if (!agreement?.signed_at) return null;
	const when = new Date(agreement.signed_at);
	const name = agreement.signed_by_name ?? "the Licensee";
	const footnoteParts = [
		`Signed electronically on ${dateFmt.format(when)} at ${timeFmt.format(when)} (Europe/London).`,
	];
	if (agreement.signed_by_ip) {
		footnoteParts.push(`Recorded IP address: ${agreement.signed_by_ip}.`);
	}
	return React.createElement(
		View,
		{ style: styles.signatureBox, wrap: false },
		React.createElement(Text, { style: styles.signatureName }, name),
		React.createElement(
			View,
			{ style: styles.signatureRule },
			React.createElement(Text, { style: styles.signatureMeta }, "Signed by"),
			React.createElement(Text, { style: styles.signatureMeta }, dateFmt.format(when)),
		),
		React.createElement(Text, { style: styles.signatureFootnote }, footnoteParts.join(" ")),
	);
}

export async function buildTenancyAgreementPdfBuffer({ html, venue, tenancy, agreement }) {
	ensureFonts();
	const tree = parse(html ?? "");

	const headerSub = [tenancy?.organisation_name, tenancy?.room_name]
		.filter(Boolean)
		.join(" · ");

	const doc = React.createElement(
		Document,
		{ title: `Tenancy agreement - ${tenancy?.organisation_name ?? venue?.name ?? ""}` },
		React.createElement(
			Page,
			{ size: "A4", style: styles.page },
			React.createElement(
				View,
				{ style: styles.header },
				React.createElement(Text, { style: styles.kicker }, "Tenancy agreement"),
				React.createElement(Text, { style: styles.venue }, venue?.name ?? ""),
				headerSub
					? React.createElement(Text, { style: styles.sub }, headerSub)
					: null,
			),
			...renderBlocks(tree.children),
			renderSignatureBlock(agreement),
			React.createElement(Text, {
				style: styles.footer,
				render: ({ pageNumber, totalPages }) =>
					`Page ${pageNumber} of ${totalPages}`,
				fixed: true,
			}),
		),
	);

	return await renderToBuffer(doc);
}
