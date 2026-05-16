import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "long",
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
	page: {
		paddingTop: 36,
		paddingBottom: 36,
		paddingLeft: 36,
		paddingRight: 36,
		fontFamily: "Helvetica",
		fontSize: 11,
		color: "#0f172a",
	},
	kicker: {
		fontSize: 9,
		letterSpacing: 3,
		textTransform: "uppercase",
		color: "#64748b",
		marginBottom: 4,
	},
	venue: {
		fontSize: 14,
		marginBottom: 10,
	},
	eventTitle: {
		fontSize: 22,
		fontFamily: "Helvetica-Bold",
		marginBottom: 6,
	},
	dateLine: {
		fontSize: 12,
		marginBottom: 2,
	},
	timeLine: {
		fontSize: 10,
		color: "#475569",
	},
	rule: {
		borderBottomWidth: 1,
		borderBottomColor: "#e2e8f0",
		marginVertical: 14,
	},
	infoRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	infoLabel: {
		fontSize: 9,
		letterSpacing: 2,
		textTransform: "uppercase",
		color: "#64748b",
	},
	infoValue: {
		fontSize: 11,
		fontFamily: "Helvetica-Bold",
	},
	qrWrap: {
		alignItems: "center",
		marginTop: 14,
	},
	qrFrame: {
		padding: 10,
		backgroundColor: "#ffffff",
		borderWidth: 1,
		borderColor: "#cbd5e1",
		borderRadius: 6,
	},
	qrImage: {
		width: 200,
		height: 200,
	},
	qrCaption: {
		marginTop: 8,
		fontSize: 9,
		color: "#64748b",
		fontFamily: "Courier",
	},
	footer: {
		marginTop: 16,
		fontSize: 9,
		color: "#94a3b8",
		textAlign: "center",
	},
	statusBadge: {
		alignSelf: "center",
		marginTop: 8,
		paddingHorizontal: 10,
		paddingVertical: 3,
		borderRadius: 999,
		fontSize: 9,
		letterSpacing: 2,
		textTransform: "uppercase",
		color: "#b91c1c",
		backgroundColor: "#fee2e2",
	},
});

async function ticketQrDataUrl(code) {
	return QRCode.toDataURL(code, {
		errorCorrectionLevel: "M",
		margin: 0,
		width: 800,
		color: { dark: "#0f172a", light: "#ffffff" },
	});
}

function buildTicketPage(ticket, qrDataUrl) {
	const startDate = ticket.event_starts_at ? new Date(ticket.event_starts_at) : null;
	const endDate = ticket.event_ends_at ? new Date(ticket.event_ends_at) : null;
	const doorsDate = ticket.event_doors_open_at ? new Date(ticket.event_doors_open_at) : null;

	const dateLabel = startDate ? dateFmt.format(startDate) : "Date TBA";
	const timeLabel = startDate && endDate
		? `${timeFmt.format(startDate)} – ${timeFmt.format(endDate)}`
		: startDate
			? timeFmt.format(startDate)
			: "";
	const doorsLabel = doorsDate ? `Doors ${timeFmt.format(doorsDate)}` : null;

	const invalid = ticket.status !== "valid";

	return React.createElement(
		Page,
		{ size: "A4", style: styles.page, key: ticket.code },
		React.createElement(Text, { style: styles.kicker }, "Ticket"),
		React.createElement(Text, { style: styles.venue }, ticket.venue_name || "The Assembly Rooms"),
		React.createElement(Text, { style: styles.eventTitle }, ticket.event_title),
		React.createElement(Text, { style: styles.dateLine }, dateLabel),
		timeLabel && React.createElement(Text, { style: styles.timeLine }, doorsLabel ? `${timeLabel} · ${doorsLabel}` : timeLabel),

		React.createElement(View, { style: styles.rule }),

		React.createElement(
			View,
			{ style: styles.infoRow },
			React.createElement(Text, { style: styles.infoLabel }, "Ticket"),
			React.createElement(Text, { style: styles.infoValue }, ticket.ticket_type_label || "-"),
		),
		ticket.holder_name && React.createElement(
			View,
			{ style: styles.infoRow },
			React.createElement(Text, { style: styles.infoLabel }, "Holder"),
			React.createElement(Text, { style: styles.infoValue }, ticket.holder_name),
		),
		React.createElement(
			View,
			{ style: styles.infoRow },
			React.createElement(Text, { style: styles.infoLabel }, "Order"),
			React.createElement(Text, { style: styles.infoValue }, ticket.order_reference),
		),

		React.createElement(
			View,
			{ style: styles.qrWrap },
			React.createElement(
				View,
				{ style: styles.qrFrame },
				React.createElement(Image, { src: qrDataUrl, style: styles.qrImage }),
			),
			React.createElement(Text, { style: styles.qrCaption }, ticket.code),
			invalid && React.createElement(
				Text,
				{ style: styles.statusBadge },
				ticket.status === "used" ? "Used" : ticket.status === "refunded" ? "Refunded" : "Void",
			),
		),

		React.createElement(
			Text,
			{ style: styles.footer },
			"Present this QR at the door - staff will scan to admit you.",
		),
	);
}

export async function buildTicketPdfBuffer(ticket) {
	const qrDataUrl = await ticketQrDataUrl(ticket.code);
	const doc = React.createElement(Document, null, buildTicketPage(ticket, qrDataUrl));
	return renderToBuffer(doc);
}

/**
 * One PDF, one page per ticket - the customer's bundle for a whole order.
 * Each ticket has its own QR / holder / status, but they share event + venue
 * meta. Order is preserved as passed in.
 */
export async function buildOrderTicketsPdfBuffer(tickets) {
	if (!Array.isArray(tickets) || tickets.length === 0) {
		throw new Error("buildOrderTicketsPdfBuffer requires at least one ticket");
	}
	const qrUrls = await Promise.all(tickets.map((t) => ticketQrDataUrl(t.code)));
	const pages = tickets.map((t, i) => buildTicketPage(t, qrUrls[i]));
	const doc = React.createElement(Document, null, ...pages);
	return renderToBuffer(doc);
}
