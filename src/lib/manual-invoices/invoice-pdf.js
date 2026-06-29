import path from "node:path";
import React from "react";
import { renderInvoiceHeader } from "@/lib/invoices/meta-header.js";
import {
	Document,
	Page,
	View,
	Text,
	Image,
	StyleSheet,
	renderToBuffer,
} from "@react-pdf/renderer";

const LOGO_PATH = path.join(process.cwd(), "public", "assembly-rooms-black.png");

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtGbp = (c) => gbp.format((c ?? 0) / 100);

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "Europe/London",
});

const styles = StyleSheet.create({
	page: {
		padding: 36,
		paddingTop: 40,
		fontFamily: "Helvetica",
		fontSize: 9,
		color: "#0f172a",
		lineHeight: 1.4,
	},
	header: {
		marginBottom: 18,
		paddingBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#e2e8f0",
	},
	headerTopRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
	},
	logo: { width: 150, height: 42, objectFit: "contain" },
	fromBlock: { alignItems: "flex-end", maxWidth: 220 },
	fromLabel: {
		fontSize: 7,
		letterSpacing: 1.5,
		textTransform: "uppercase",
		color: "#94a3b8",
		marginBottom: 2,
	},
	fromLine: { fontSize: 8.5, textAlign: "right" },
	fromMuted: { fontSize: 8, color: "#64748b", textAlign: "right" },

	metaRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 16,
		gap: 12,
	},
	metaCell: { flexDirection: "column", flexShrink: 1, maxWidth: 220 },
	metaLabel: {
		fontSize: 7,
		letterSpacing: 1.5,
		textTransform: "uppercase",
		color: "#94a3b8",
	},
	metaValue: { marginTop: 1, fontSize: 9 },
	muted: { color: "#64748b" },

	sectionTitle: {
		fontSize: 7.5,
		letterSpacing: 1.8,
		textTransform: "uppercase",
		color: "#64748b",
		marginTop: 18,
		marginBottom: 6,
	},

	tableHead: {
		flexDirection: "row",
		borderTopWidth: 0.5,
		borderTopColor: "#cbd5e1",
		borderBottomWidth: 1,
		borderBottomColor: "#cbd5e1",
	},
	tableHeadCell: {
		fontSize: 6.5,
		letterSpacing: 1,
		textTransform: "uppercase",
		color: "#64748b",
		paddingHorizontal: 4,
		paddingVertical: 5,
	},
	tableRow: {
		flexDirection: "row",
		borderBottomWidth: 0.5,
		borderBottomColor: "#e2e8f0",
	},
	tableCell: { paddingHorizontal: 4, paddingVertical: 6 },
	cellRight: { textAlign: "right" },

	tfootRow: { flexDirection: "row" },
	tfootRowStrong: {
		flexDirection: "row",
		borderTopWidth: 1,
		borderTopColor: "#cbd5e1",
	},
	tfootLabel: {
		paddingHorizontal: 4,
		paddingVertical: 4,
		textAlign: "right",
		color: "#475569",
	},
	tfootValue: { paddingHorizontal: 4, paddingVertical: 4, textAlign: "right" },
	tfootStrong: { fontFamily: "Helvetica-Bold" },
	tfootDiscount: { color: "#0a7d3a" },

	bigTotalBlock: {
		alignItems: "center",
		marginTop: 26,
		paddingTop: 18,
		borderTopWidth: 1,
		borderTopColor: "#cbd5e1",
	},
	bigTotalLabel: {
		fontSize: 8,
		letterSpacing: 3,
		textTransform: "uppercase",
		color: "#64748b",
	},
	bigTotalValueWrap: {
		height: 46,
		marginTop: 8,
		marginBottom: 8,
		justifyContent: "center",
	},
	bigTotalValue: { fontSize: 36, fontFamily: "Helvetica-Bold", lineHeight: 1 },
	bigTotalSub: { fontSize: 10, color: "#64748b" },
	footer: { marginTop: 20, fontSize: 8, color: "#64748b" },

	descriptionBlock: { marginTop: 14 },
	descriptionLabel: {
		fontSize: 7,
		letterSpacing: 1.5,
		textTransform: "uppercase",
		color: "#94a3b8",
		marginBottom: 2,
	},
	descriptionText: { fontSize: 9, color: "#0f172a" },
});

/**
 * One-off (manual) invoice PDF. Mirrors the booking + tenancy invoice
 * shape for visual consistency:
 *
 *   - Header: logo top-left, venue "From" address top-right.
 *   - Meta row: Billed to (organisation if linked, otherwise the ad-hoc
 *     customer details captured on the invoice), Reference, Issued.
 *   - Optional description block under the meta row.
 *   - Line items table: description + amount.
 *   - Footer: Subtotal → Discount (when > 0) → Total.
 *   - Big amount-due block at the bottom.
 */
export async function buildManualInvoicePdfBuffer({ invoice, lines, venue }) {
	const issued = invoice.issued_at
		? dateFmt.format(new Date(invoice.issued_at))
		: dateFmt.format(new Date());

	const billedTo = invoice.organisation_id
		? {
				name: invoice.organisation_name ?? "—",
				lines: Array.isArray(invoice.organisation_address_lines)
					? invoice.organisation_address_lines
					: [],
				vat: invoice.organisation_vat_number ?? null,
				email: null,
			}
		: {
				name: invoice.customer_name ?? "—",
				lines: Array.isArray(invoice.customer_address_lines)
					? invoice.customer_address_lines
					: [],
				vat: invoice.customer_vat_number ?? null,
				email: invoice.customer_email ?? null,
			};

	const venueAddressLines = Array.isArray(venue?.address_lines)
		? venue.address_lines
		: [];

	const doc = React.createElement(
		Document,
		{ title: `Invoice ${invoice.reference}` },
		React.createElement(
			Page,
			{ size: "A4", style: styles.page },

			// Shared invoice header: logo + venue From block + 4-cell meta
			// row. Identical across every invoice PDF.
			renderInvoiceHeader({
				logoPath: LOGO_PATH,
				venue,
				billedTo,
				reference: invoice.reference,
				issued,
			}),
			invoice.description
				? React.createElement(
						View,
						{ style: styles.descriptionBlock },
						React.createElement(Text, { style: styles.descriptionLabel }, "For"),
						React.createElement(Text, { style: styles.descriptionText }, invoice.description),
					)
				: null,

			// Lines
			React.createElement(Text, { style: styles.sectionTitle }, "Items"),
			React.createElement(
				View,
				{ style: styles.tableHead, fixed: true },
				React.createElement(
					Text,
					{ style: [styles.tableHeadCell, { flex: 1 }] },
					"Description",
				),
				React.createElement(
					Text,
					{ style: [styles.tableHeadCell, { width: 100, textAlign: "right" }] },
					"Amount",
				),
			),
			...lines.map((l, i) =>
				React.createElement(
					View,
					{ key: l.id ?? i, style: styles.tableRow, wrap: false },
					React.createElement(
						Text,
						{ style: [styles.tableCell, { flex: 1 }] },
						l.description,
					),
					React.createElement(
						Text,
						{ style: [styles.tableCell, styles.cellRight, { width: 100 }] },
						fmtGbp(l.amount_cents ?? 0),
					),
				),
			),

			// Footer
			React.createElement(
				View,
				{ style: styles.tfootRow },
				React.createElement(
					Text,
					{ style: [styles.tfootLabel, { flex: 1 }] },
					"Subtotal",
				),
				React.createElement(
					Text,
					{ style: [styles.tfootValue, { width: 100 }] },
					fmtGbp(invoice.subtotal_cents ?? 0),
				),
			),
			(invoice.discount_cents ?? 0) > 0
				? React.createElement(
						View,
						{ style: styles.tfootRow },
						React.createElement(
							Text,
							{ style: [styles.tfootLabel, styles.tfootDiscount, { flex: 1 }] },
							"Discount applied",
						),
						React.createElement(
							Text,
							{ style: [styles.tfootValue, styles.tfootDiscount, { width: 100 }] },
							`-${fmtGbp(invoice.discount_cents)}`,
						),
					)
				: null,
			React.createElement(
				View,
				{ style: styles.tfootRowStrong },
				React.createElement(
					Text,
					{ style: [styles.tfootLabel, styles.tfootStrong, { flex: 1 }] },
					"Total",
				),
				React.createElement(
					Text,
					{ style: [styles.tfootValue, styles.tfootStrong, { width: 100 }] },
					fmtGbp(invoice.total_cents ?? 0),
				),
			),

			// Big amount due
			React.createElement(
				View,
				{ style: styles.bigTotalBlock, wrap: false },
				React.createElement(
					Text,
					{ style: styles.bigTotalLabel },
					invoice.paid_at ? "Total paid" : "Amount due",
				),
				React.createElement(
					View,
					{ style: styles.bigTotalValueWrap },
					React.createElement(
						Text,
						{ style: styles.bigTotalValue },
						fmtGbp(invoice.total_cents ?? 0),
					),
				),
				React.createElement(
					Text,
					{ style: styles.bigTotalSub },
					invoice.paid_at
						? `Received ${dateFmt.format(new Date(invoice.paid_at))}`
						: "Please pay using the reference above.",
				),
			),

			invoice.notes
				? React.createElement(Text, { style: styles.footer }, invoice.notes)
				: React.createElement(
						Text,
						{ style: styles.footer },
						`Invoice issued by ${venue?.name ?? "the venue"}. Please contact us about anything that doesn't look right.`,
					),
		),
	);

	return renderToBuffer(doc);
}
