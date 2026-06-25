import React from "react";
import {
	Document,
	Page,
	View,
	Text,
	StyleSheet,
	renderToBuffer,
} from "@react-pdf/renderer";

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
	intro: { marginTop: 8, marginBottom: 8 },
	sectionHeading: {
		fontFamily: "Helvetica-Bold",
		fontSize: 11.5,
		marginTop: 14,
		marginBottom: 6,
	},
	paragraph: { marginBottom: 6 },
	acceptanceBox: {
		marginTop: 24,
		borderWidth: 1,
		borderColor: "#cbd5e1",
		borderRadius: 6,
		paddingVertical: 10,
		paddingHorizontal: 14,
		backgroundColor: "#f8fafc",
	},
	acceptanceTitle: {
		fontFamily: "Helvetica-Bold",
		fontSize: 10.5,
		marginBottom: 4,
	},
	acceptanceMeta: { fontSize: 9, color: "#475569" },
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

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	dateStyle: "long",
	timeZone: "Europe/London",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

function renderAcceptanceBlock(booking) {
	if (!booking?.agreement_accepted_at) return null;
	const when = new Date(booking.agreement_accepted_at);
	return React.createElement(
		View,
		{ style: styles.acceptanceBox, wrap: false },
		React.createElement(Text, { style: styles.acceptanceTitle }, "Accepted"),
		React.createElement(
			Text,
			{ style: styles.acceptanceMeta },
			`Accepted electronically on ${dateFmt.format(when)} at ${timeFmt.format(when)} (Europe/London).`,
		),
	);
}

/**
 * Render the snapshotted booking agreement to a PDF Buffer. Shape mirrors
 * what the rich-section editor in /admin/settings/booking-agreement
 * produces: `{ title, intro, version, sections: [{ heading, paragraphs[] }] }`.
 *
 * Designed to be called both for the email attachment (no acceptance block)
 * and after the customer ticks the agreement box on the pay page (renders
 * an acceptance footer with the timestamp).
 */
export async function buildBookingAgreementPdfBuffer({ agreement, venue, booking, customer }) {
	const sections = Array.isArray(agreement?.sections) ? agreement.sections : [];
	const customerLine = customer
		? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
		: "";
	const headerSub = [booking?.reference, customerLine].filter(Boolean).join(" · ");

	const doc = React.createElement(
		Document,
		{ title: `${agreement?.title ?? "Booking Agreement"} - ${booking?.reference ?? ""}` },
		React.createElement(
			Page,
			{ size: "A4", style: styles.page },
			React.createElement(
				View,
				{ style: styles.header },
				React.createElement(
					Text,
					{ style: styles.kicker },
					agreement?.version ? `${agreement.title} · ${agreement.version}` : agreement?.title ?? "Booking Agreement",
				),
				React.createElement(Text, { style: styles.venue }, venue?.name ?? ""),
				headerSub
					? React.createElement(Text, { style: styles.sub }, headerSub)
					: null,
			),
			agreement?.intro
				? React.createElement(
						View,
						{ style: styles.intro },
						React.createElement(Text, null, agreement.intro),
					)
				: null,
			...sections.map((s, i) =>
				React.createElement(
					View,
					{ key: i },
					s.heading
						? React.createElement(Text, { style: styles.sectionHeading }, s.heading)
						: null,
					...(Array.isArray(s.paragraphs) ? s.paragraphs : [])
						.filter((p) => p && p.trim().length > 0)
						.map((p, j) =>
							React.createElement(
								View,
								{ key: j, style: styles.paragraph },
								React.createElement(Text, null, p),
							),
						),
				),
			),
			renderAcceptanceBlock(booking),
			React.createElement(Text, {
				style: styles.footer,
				render: ({ pageNumber, totalPages }) =>
					`Page ${pageNumber} of ${totalPages}${agreement?.version ? ` · ${agreement.version}` : ""}`,
				fixed: true,
			}),
		),
	);

	return await renderToBuffer(doc);
}
