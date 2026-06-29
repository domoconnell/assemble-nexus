import React from "react";
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";

/**
 * Shared meta header rendered at the top of every invoice PDF
 * (tenancy, booking, manual). Four cells in a single row:
 *
 *   BILLED TO          REFERENCE          PAYMENT INFORMATION    ISSUED
 *   {name}             {reference}        {bank_name}            {issued_date}
 *   {address lines}    {sub line, e.g.    {account_name}
 *   {VAT}              "June 2026"}       {sort · account}
 *                                         (bold mono)
 *
 * Centralising this layout means changing one file updates every
 * invoice — vital for the "consistency across all our invoices"
 * promise. Styles are scoped here so individual PDFs can't drift
 * apart on padding / typography.
 */

const META_STYLES = StyleSheet.create({
	wrap: {
		marginBottom: 18,
		paddingBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#e2e8f0",
	},
	topRow: {
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
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 14,
		gap: 12,
	},
	cell: {
		flexDirection: "column",
		flexShrink: 1,
		flexBasis: 0,
		flexGrow: 1,
	},
	cellWide: {
		flexDirection: "column",
		flexShrink: 1,
		flexBasis: 0,
		flexGrow: 1.4,
	},
	label: {
		fontSize: 7,
		letterSpacing: 1.5,
		textTransform: "uppercase",
		color: "#94a3b8",
		marginBottom: 2,
	},
	value: { fontSize: 9, marginTop: 1 },
	mutedValue: { fontSize: 9, marginTop: 1, color: "#64748b" },
	monoValue: {
		fontSize: 9,
		marginTop: 1,
		fontFamily: "Helvetica-Bold",
	},
});

/**
 * Render the row. `billedTo` is `{ name, lines: [], vat?, email? }`.
 * `referenceSub` is an optional muted line under the reference (e.g.
 * the period on a tenancy invoice or the payment label on a booking
 * instalment invoice).
 */
export function renderInvoiceMetaHeader({
	billedTo,
	reference,
	referenceSub,
	bankDetails,
	issued,
}) {
	return React.createElement(
		View,
		{ style: META_STYLES.row, key: "meta-row" },
		// 1. BILLED TO — slightly wider because addresses run long.
		React.createElement(
			View,
			{ style: META_STYLES.cellWide },
			React.createElement(Text, { style: META_STYLES.label }, "Billed to"),
			React.createElement(Text, { style: META_STYLES.value }, billedTo?.name ?? "—"),
			...(Array.isArray(billedTo?.lines)
				? billedTo.lines.map((line, i) =>
						React.createElement(
							Text,
							{ key: `bt-line-${i}`, style: META_STYLES.mutedValue },
							line,
						),
					)
				: []),
			billedTo?.email
				? React.createElement(Text, { style: META_STYLES.mutedValue }, billedTo.email)
				: null,
			billedTo?.vat
				? React.createElement(
						Text,
						{ style: META_STYLES.mutedValue },
						`VAT: ${billedTo.vat}`,
					)
				: null,
		),
		// 2. REFERENCE (with optional sub-line like the period).
		React.createElement(
			View,
			{ style: META_STYLES.cell },
			React.createElement(Text, { style: META_STYLES.label }, "Reference"),
			React.createElement(Text, { style: META_STYLES.value }, reference ?? "—"),
			referenceSub
				? React.createElement(
						Text,
						{ style: META_STYLES.mutedValue },
						referenceSub,
					)
				: null,
		),
		// 3. PAYMENT INFORMATION — bank details, wider so the account
		// name fits on one line. Returns a fallback empty cell when
		// the venue hasn't set bank details yet.
		renderBankCell(bankDetails),
		// 4. ISSUED date.
		React.createElement(
			View,
			{ style: META_STYLES.cell },
			React.createElement(Text, { style: META_STYLES.label }, "Issued"),
			React.createElement(Text, { style: META_STYLES.value }, issued ?? "—"),
		),
	);
}

/**
 * Full top-of-document header: logo + venue "From" block on row 1,
 * shared 4-cell meta row on row 2, both wrapped in the same bordered
 * box so every invoice PDF has visually identical chrome.
 */
export function renderInvoiceHeader({
	logoPath,
	venue,
	billedTo,
	reference,
	referenceSub,
	issued,
}) {
	const venueAddressLines = Array.isArray(venue?.address_lines)
		? venue.address_lines
		: [];
	return React.createElement(
		View,
		{ style: META_STYLES.wrap, key: "invoice-header" },
		React.createElement(
			View,
			{ style: META_STYLES.topRow },
			logoPath
				? React.createElement(Image, { src: logoPath, style: META_STYLES.logo })
				: React.createElement(View, { style: META_STYLES.logo }),
			React.createElement(
				View,
				{ style: META_STYLES.fromBlock },
				React.createElement(Text, { style: META_STYLES.fromLabel }, "From"),
				React.createElement(
					Text,
					{ style: META_STYLES.fromLine },
					venue?.name ?? "Venue",
				),
				...venueAddressLines.map((line, i) =>
					React.createElement(
						Text,
						{ key: `va-${i}`, style: META_STYLES.fromMuted },
						line,
					),
				),
				venue?.contact_email
					? React.createElement(
							Text,
							{ style: META_STYLES.fromMuted },
							venue.contact_email,
						)
					: null,
				venue?.phone
					? React.createElement(Text, { style: META_STYLES.fromMuted }, venue.phone)
					: null,
			),
		),
		renderInvoiceMetaHeader({
			billedTo,
			reference,
			referenceSub,
			bankDetails: venue?.bank_details,
			issued,
		}),
	);
}

function renderBankCell(bankDetails) {
	const cellStyle = META_STYLES.cellWide;
	if (!bankDetails || (!bankDetails.account_number && !bankDetails.iban)) {
		// Render an empty placeholder so the 4-column grid stays even.
		return React.createElement(
			View,
			{ style: cellStyle, key: "pay" },
			React.createElement(Text, { style: META_STYLES.label }, "Payment information"),
			React.createElement(Text, { style: META_STYLES.mutedValue }, "—"),
		);
	}
	const { bank_name, account_name, sort_code, account_number, iban } = bankDetails;
	const idLine =
		sort_code && account_number
			? `${sort_code} · ${account_number}`
			: account_number || iban || "";
	return React.createElement(
		View,
		{ style: cellStyle, key: "pay" },
		React.createElement(Text, { style: META_STYLES.label }, "Payment information"),
		bank_name
			? React.createElement(Text, { style: META_STYLES.value }, bank_name)
			: null,
		account_name
			? React.createElement(Text, { style: META_STYLES.value }, account_name)
			: null,
		idLine
			? React.createElement(Text, { style: META_STYLES.monoValue }, idLine)
			: null,
	);
}
