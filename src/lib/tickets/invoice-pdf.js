import React from "react";
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "Europe/London",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

const styles = StyleSheet.create({
	page: { padding: 48, fontFamily: "Helvetica", fontSize: 10, color: "#0f172a" },
	header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
	kicker: { fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: "#64748b" },
	venue: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 4 },
	addressLine: { fontSize: 9, color: "#475569", marginTop: 2 },
	right: { alignItems: "flex-end" },
	invoiceTitle: { fontSize: 22, fontFamily: "Helvetica-Bold" },
	muted: { color: "#475569" },
	rule: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 14 },
	section: { marginTop: 10, marginBottom: 14 },
	sectionLabel: { fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#64748b", marginBottom: 4 },
	row: { flexDirection: "row", marginBottom: 4 },
	rowLabel: { flex: 1 },
	rowValue: { textAlign: "right", fontFamily: "Helvetica-Bold" },
	tableHeader: {
		flexDirection: "row",
		borderBottomWidth: 1,
		borderBottomColor: "#cbd5e1",
		paddingBottom: 6,
		marginBottom: 6,
	},
	tableHeaderCell: {
		fontSize: 8,
		letterSpacing: 2,
		textTransform: "uppercase",
		color: "#64748b",
	},
	tableRow: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
	colDescription: { flex: 4 },
	colQty: { flex: 1, textAlign: "right" },
	colUnit: { flex: 1.2, textAlign: "right" },
	colTotal: { flex: 1.4, textAlign: "right" },
	totalsBlock: { marginTop: 18, alignSelf: "flex-end", width: 260 },
	totalsRow: { flexDirection: "row", paddingVertical: 3 },
	totalsLabel: { flex: 1, color: "#475569" },
	totalsValue: { textAlign: "right" },
	grandTotal: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#0f172a", paddingTop: 8, borderTopWidth: 1, borderTopColor: "#cbd5e1", marginTop: 6 },
	footer: { marginTop: 40, fontSize: 9, color: "#94a3b8", textAlign: "center" },
});

export async function buildInvoicePdfBuffer({ order, lines, customer, venue }) {
	const tableRows = [];
	for (const l of lines) {
		const qty = l.quantity > 1 ? l.quantity : 1;
		const unit = l.unit_price_cents ?? Math.round((l.line_total_cents ?? 0) / Math.max(1, qty));
		tableRows.push({
			description: l.name_snapshot ?? "-",
			quantity: qty,
			unit_cents: unit,
			total_cents: l.line_total_cents ?? 0,
		});
	}

	const issuedAt = new Date();
	const eventDate = order.event_starts_at ? new Date(order.event_starts_at) : null;

	const venueAddress = Array.isArray(venue?.address_lines) ? venue.address_lines : [];

	const doc = React.createElement(
		Document,
		null,
		React.createElement(
			Page,
			{ size: "A4", style: styles.page },
			React.createElement(
				View,
				{ style: styles.header },
				React.createElement(
					View,
					null,
					React.createElement(Text, { style: styles.kicker }, "Invoice from"),
					React.createElement(Text, { style: styles.venue }, venue?.name || ""),
					...venueAddress.map((line, i) =>
						React.createElement(Text, { key: i, style: styles.addressLine }, line),
					),
				),
				React.createElement(
					View,
					{ style: styles.right },
					React.createElement(Text, { style: styles.kicker }, "Invoice"),
					React.createElement(Text, { style: styles.invoiceTitle }, order.reference),
					React.createElement(Text, { style: [styles.addressLine, { marginTop: 6 }] }, `Issued ${dateFmt.format(issuedAt)}`),
					order.paid_at && React.createElement(
						Text,
						{ style: styles.addressLine },
						`Paid ${dateFmt.format(new Date(order.paid_at))}`,
					),
				),
			),

			React.createElement(
				View,
				{ style: styles.section },
				React.createElement(Text, { style: styles.sectionLabel }, "Billed to"),
				React.createElement(Text, null, customer ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() : "-"),
				customer?.email && React.createElement(Text, { style: styles.addressLine }, customer.email),
				customer?.organisation && React.createElement(Text, { style: styles.addressLine }, customer.organisation),
			),

			React.createElement(
				View,
				{ style: styles.section },
				React.createElement(Text, { style: styles.sectionLabel }, "For"),
				React.createElement(Text, null, order.event_title),
				eventDate && React.createElement(
					Text,
					{ style: styles.addressLine },
					`${dateFmt.format(eventDate)} at ${timeFmt.format(eventDate)}`,
				),
			),

			React.createElement(View, { style: styles.rule }),

			React.createElement(
				View,
				{ style: styles.tableHeader },
				React.createElement(Text, { style: [styles.tableHeaderCell, styles.colDescription] }, "Description"),
				React.createElement(Text, { style: [styles.tableHeaderCell, styles.colQty] }, "Qty"),
				React.createElement(Text, { style: [styles.tableHeaderCell, styles.colUnit] }, "Unit"),
				React.createElement(Text, { style: [styles.tableHeaderCell, styles.colTotal] }, "Total"),
			),
			...tableRows.map((r, i) =>
				React.createElement(
					View,
					{ key: i, style: styles.tableRow },
					React.createElement(Text, { style: styles.colDescription }, r.description),
					React.createElement(Text, { style: styles.colQty }, String(r.quantity)),
					React.createElement(Text, { style: styles.colUnit }, fmt(r.unit_cents)),
					React.createElement(Text, { style: styles.colTotal }, fmt(r.total_cents)),
				),
			),

			React.createElement(
				View,
				{ style: styles.totalsBlock },
				React.createElement(
					View,
					{ style: styles.totalsRow },
					React.createElement(Text, { style: styles.totalsLabel }, "Subtotal"),
					React.createElement(Text, { style: styles.totalsValue }, fmt(order.subtotal_cents)),
				),
				order.vat_cents > 0 && React.createElement(
					View,
					{ style: styles.totalsRow },
					React.createElement(Text, { style: styles.totalsLabel }, "VAT"),
					React.createElement(Text, { style: styles.totalsValue }, fmt(order.vat_cents)),
				),
				React.createElement(
					View,
					{ style: [styles.totalsRow, styles.grandTotal] },
					React.createElement(Text, { style: styles.totalsLabel }, "Total paid"),
					React.createElement(Text, { style: styles.totalsValue }, fmt(order.total_cents)),
				),
			),

			React.createElement(
				Text,
				{ style: styles.footer },
				`Invoice ${order.reference} · ${venue?.name || "The Assembly Rooms"}`,
			),
		),
	);

	return renderToBuffer(doc);
}
