import path from "node:path";
import React from "react";
import { renderBankBlock } from "@/lib/invoices/bank-block.js";
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

const dateShortFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

function formatHoursLabel(minutes) {
	if (!minutes || minutes <= 0) return "0h";
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${m}m`;
}

function segmentMinutes(s) {
	if (!s?.starts_at || !s?.ends_at) return 0;
	const ms = new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime();
	return Math.max(0, Math.round(ms / 60000));
}

function segmentDateRange(s) {
	const start = new Date(s.starts_at);
	const end = new Date(s.ends_at);
	const sameDay = start.toDateString() === end.toDateString();
	if (sameDay) {
		return `${dateShortFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(end)}`;
	}
	return `${dateTimeFmt.format(start)} – ${dateTimeFmt.format(end)}`;
}

function segmentRateMeta(s) {
	// rate_snapshot_kind: 'per_hour' | 'fixed' | 'per_session' | …
	const kind = s.rate_snapshot_kind ?? "per_hour";
	const unit = s.rate_snapshot_amount_cents ?? 0;
	const subtotal = s.subtotal_cents ?? 0;
	if (kind === "per_hour" || kind === "hourly") {
		const minutes = segmentMinutes(s);
		return {
			basis: "Hourly",
			rate: unit ? `${fmtGbp(unit)}/hr` : fmtGbp(subtotal),
			quantity: formatHoursLabel(minutes),
		};
	}
	if (kind === "per_session" || kind === "session") {
		const sessions = s.units_x100 ? s.units_x100 / 100 : 1;
		return {
			basis: "Per session",
			rate: unit ? `${fmtGbp(unit)}/session` : fmtGbp(subtotal),
			quantity: `${sessions} session${sessions === 1 ? "" : "s"}`,
		};
	}
	return { basis: "Fixed", rate: fmtGbp(subtotal), quantity: "—" };
}

// A4 = 595pt wide. Page padding 36 each side → 523pt usable.
// Two-column body layout — one row per booking segment.
const C_WIDTHS = {
	room: 130,
	dates: 175,
	basis: 60,
	rate: 65,
	qty: 45,
	subtotal: 70,
};

const styles = StyleSheet.create({
	page: {
		padding: 36,
		paddingTop: 40,
		fontFamily: "Helvetica",
		fontSize: 8.5,
		color: "#0f172a",
		lineHeight: 1.4,
	},

	// HEADER
	header: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
	headerTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
	logo: { width: 150, height: 42, objectFit: "contain" },
	fromBlock: { alignItems: "flex-end", maxWidth: 220 },
	fromLabel: { fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase", color: "#94a3b8", marginBottom: 2 },
	fromLine: { fontSize: 8.5, textAlign: "right" },
	fromMuted: { fontSize: 8, color: "#64748b", textAlign: "right" },

	metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, gap: 12 },
	metaCell: { flexDirection: "column", flexShrink: 1, maxWidth: 200 },
	metaLabel: { fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase", color: "#94a3b8" },
	metaValue: { marginTop: 1, fontSize: 9 },
	muted: { color: "#64748b" },
	strikethrough: { textDecoration: "line-through", color: "#94a3b8" },

	sectionTitle: {
		fontSize: 7.5,
		letterSpacing: 1.8,
		textTransform: "uppercase",
		color: "#64748b",
		marginTop: 18,
		marginBottom: 6,
	},

	// TABLE
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
		borderRightWidth: 0.5,
		borderRightColor: "#e2e8f0",
	},
	tableHeadCellLast: { borderRightWidth: 0 },
	tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
	tableCell: {
		paddingHorizontal: 4,
		paddingVertical: 5,
		borderRightWidth: 0.5,
		borderRightColor: "#e2e8f0",
	},
	tableCellLast: { borderRightWidth: 0 },
	cellRight: { textAlign: "right" },

	// TFOOT
	tfootRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
	tfootRowStrong: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#cbd5e1" },
	tfootLabel: { paddingHorizontal: 4, paddingVertical: 4, textAlign: "right", color: "#475569" },
	tfootValue: { paddingHorizontal: 4, paddingVertical: 4, textAlign: "right" },
	tfootStrong: { fontFamily: "Helvetica-Bold" },
	tfootDiscount: { color: "#0a7d3a" },

	// BIG TOTAL
	bigTotalBlock: {
		alignItems: "center",
		marginTop: 26,
		paddingTop: 18,
		borderTopWidth: 1,
		borderTopColor: "#cbd5e1",
	},
	bigTotalLabel: { fontSize: 8, letterSpacing: 3, textTransform: "uppercase", color: "#64748b" },
	bigTotalValueWrap: { height: 46, marginTop: 8, marginBottom: 8, justifyContent: "center" },
	bigTotalValue: { fontSize: 36, fontFamily: "Helvetica-Bold", lineHeight: 1 },
	bigTotalSub: { fontSize: 10, color: "#64748b" },

	// THIS-INVOICE box (per-payment mode)
	sliceBox: {
		marginTop: 18,
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderWidth: 0.5,
		borderColor: "#cbd5e1",
		backgroundColor: "#f8fafc",
	},
	sliceLabel: { fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase", color: "#64748b" },
	sliceTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
	sliceValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },

	footer: { marginTop: 20, fontSize: 8, color: "#64748b" },
});

function headCell(width, label, opts = {}) {
	const styleArr = [
		styles.tableHeadCell,
		opts.alignRight ? styles.cellRight : null,
		{ width },
		opts.last ? styles.tableHeadCellLast : null,
	].filter(Boolean);
	return React.createElement(Text, { style: styleArr }, label);
}

function bodyCell(width, value, opts = {}) {
	const styleArr = [
		styles.tableCell,
		opts.alignRight ? styles.cellRight : null,
		opts.muted ? styles.muted : null,
		{ width },
		opts.last ? styles.tableCellLast : null,
	].filter(Boolean);
	if (Array.isArray(value)) {
		return React.createElement(View, { style: styleArr }, ...value);
	}
	return React.createElement(Text, { style: styleArr }, value);
}

function renderSegmentRow(s, idx) {
	const meta = segmentRateMeta(s);
	const subtotal = s.subtotal_cents ?? 0;
	return React.createElement(
		View,
		{ key: `seg-${idx}`, style: styles.tableRow, wrap: false },
		bodyCell(C_WIDTHS.room, s.room_name ?? "Room"),
		bodyCell(C_WIDTHS.dates, [
			React.createElement(Text, { key: "d" }, segmentDateRange(s)),
			s.booking_type_label
				? React.createElement(
						Text,
						{ key: "t", style: { color: "#94a3b8", fontSize: 7.5, marginTop: 1 } },
						s.booking_type_label,
					)
				: null,
		]),
		bodyCell(C_WIDTHS.basis, meta.basis, { muted: true }),
		bodyCell(C_WIDTHS.rate, meta.rate, { alignRight: true }),
		bodyCell(C_WIDTHS.qty, meta.quantity, { alignRight: true, muted: true }),
		bodyCell(C_WIDTHS.subtotal, fmtGbp(subtotal), { alignRight: true, last: true }),
	);
}

function renderFacilityRow(f, idx) {
	return React.createElement(
		View,
		{ key: `fac-${idx}`, style: styles.tableRow, wrap: false },
		bodyCell(C_WIDTHS.room, f.name_snapshot ?? "Facility"),
		bodyCell(C_WIDTHS.dates, "Facility / package", { muted: true }),
		bodyCell(C_WIDTHS.basis, "Add-on", { muted: true }),
		bodyCell(C_WIDTHS.rate, fmtGbp(f.price_snapshot_cents ?? 0), { alignRight: true, muted: true }),
		bodyCell(C_WIDTHS.qty, f.quantity ? String(f.quantity) : "1", { alignRight: true, muted: true }),
		bodyCell(C_WIDTHS.subtotal, fmtGbp(f.computed_subtotal_cents ?? 0), { alignRight: true, last: true }),
	);
}

function tfootSpacer(width) {
	return React.createElement(View, { style: { width } });
}

function tfootRow({ label, value, strong = false, discount = false, topBorder = false }) {
	const labelWidth =
		C_WIDTHS.room + C_WIDTHS.dates + C_WIDTHS.basis + C_WIDTHS.rate + C_WIDTHS.qty;
	const valueStyle = [
		styles.tfootValue,
		{ width: C_WIDTHS.subtotal },
		strong ? styles.tfootStrong : null,
		discount ? styles.tfootDiscount : null,
	].filter(Boolean);
	const labelStyle = [
		styles.tfootLabel,
		{ width: labelWidth },
		strong ? styles.tfootStrong : null,
		discount ? styles.tfootDiscount : null,
	].filter(Boolean);
	return React.createElement(
		View,
		{ style: topBorder ? styles.tfootRowStrong : styles.tfootRow },
		React.createElement(Text, { style: labelStyle }, label),
		React.createElement(Text, { style: valueStyle }, value),
	);
}

/**
 * Build a booking invoice PDF in the same shape as the tenancy invoice:
 * venue address top-right ("From"), customer/org address as "Billed to"
 * underneath, full segment + facility table, and a clear footer that
 * spells out subtotal, override discount and VAT before the final total.
 *
 * Two modes, gated by whether `payment` is provided:
 *
 *   • payment set    → full breakdown of the booking is shown so the
 *                       customer can see WHY the amount they owe today
 *                       is what it is, followed by a "This invoice
 *                       covers" callout box that singles out the slice
 *                       this PDF is billing for.
 *   • payment null   → invoice for the whole booking, big "Amount due"
 *                       at the bottom equals the booking total.
 *
 * When the booking has been overridden, the footer shows both the
 * standard total and the discount (with the override reason if set) so
 * the customer sees the saving explicitly — mirrors the tenancy
 * "Standard rate total → Total reduction → Grand total" pattern.
 */
export async function buildBookingInvoicePdfBuffer({
	booking,
	payment = null,
	payments = [],
	segments = [],
	facilities = [],
	customer,
	organisation = null,
	venue,
}) {
	const isPaymentInvoice = !!payment;
	const issued = dateFmt.format(new Date());
	const amountDueCents = isPaymentInvoice
		? (payment.amount_cents ?? 0)
		: (booking.total_cents ?? 0);

	const hasOverride = booking.original_total_cents != null;
	const standardTotal = hasOverride
		? (booking.original_total_cents ?? 0)
		: (booking.total_cents ?? 0);
	const effectiveTotal = booking.total_cents ?? 0;
	const discountCents = hasOverride ? standardTotal - effectiveTotal : 0;
	const vatCents = booking.vat_cents ?? 0;

	const segmentsSubtotal = segments.reduce((s, x) => s + (x.subtotal_cents ?? 0), 0);
	const facilitiesSubtotal = facilities.reduce(
		(s, x) => s + (x.computed_subtotal_cents ?? 0),
		0,
	);
	const itemsSubtotal = segmentsSubtotal + facilitiesSubtotal;

	const billedTo = organisation?.name
		? {
				name: organisation.name,
				lines: Array.isArray(organisation.address_lines)
					? organisation.address_lines
					: [],
				vat: organisation.vat_number ?? null,
			}
		: {
				name:
					[customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "—",
				lines: customer?.email ? [customer.email] : [],
				vat: null,
			};

	const venueAddressLines = Array.isArray(venue?.address_lines)
		? venue.address_lines
		: [];

	const docTitle = isPaymentInvoice
		? `Invoice ${booking.reference} · ${payment.label}`
		: `Invoice ${booking.reference}`;

	const doc = React.createElement(
		Document,
		{ title: docTitle },
		React.createElement(
			Page,
			{ size: "A4", style: styles.page },

			// HEADER — logo top-left, venue "From" address top-right
			React.createElement(
				View,
				{ style: styles.header },
				React.createElement(
					View,
					{ style: styles.headerTopRow },
					React.createElement(Image, { src: LOGO_PATH, style: styles.logo }),
					React.createElement(
						View,
						{ style: styles.fromBlock },
						React.createElement(Text, { style: styles.fromLabel }, "From"),
						React.createElement(Text, { style: styles.fromLine }, venue?.name ?? "Venue"),
						...venueAddressLines.map((line, i) =>
							React.createElement(Text, { key: `va-${i}`, style: styles.fromMuted }, line),
						),
						venue?.contact_email
							? React.createElement(Text, { style: styles.fromMuted }, venue.contact_email)
							: null,
						venue?.phone
							? React.createElement(Text, { style: styles.fromMuted }, venue.phone)
							: null,
					),
				),

				// Billed-to / reference / issued
				React.createElement(
					View,
					{ style: styles.metaRow },
					React.createElement(
						View,
						{ style: [styles.metaCell, { maxWidth: 240 }] },
						React.createElement(Text, { style: styles.metaLabel }, "Billed to"),
						React.createElement(Text, { style: styles.metaValue }, billedTo.name),
						...billedTo.lines.map((line, i) =>
							React.createElement(
								Text,
								{ key: `bt-${i}`, style: [styles.metaValue, styles.muted] },
								line,
							),
						),
						billedTo.vat
							? React.createElement(
									Text,
									{ style: [styles.metaValue, styles.muted] },
									`VAT: ${billedTo.vat}`,
								)
							: null,
					),
					React.createElement(
						View,
						{ style: styles.metaCell },
						React.createElement(Text, { style: styles.metaLabel }, "Reference"),
						React.createElement(Text, { style: styles.metaValue }, booking.reference),
						isPaymentInvoice
							? React.createElement(
									Text,
									{ style: [styles.metaValue, styles.muted] },
									payment.label,
								)
							: null,
					),
					React.createElement(
						View,
						{ style: styles.metaCell },
						React.createElement(Text, { style: styles.metaLabel }, "Issued"),
						React.createElement(Text, { style: styles.metaValue }, issued),
					),
				),
			),

			// Pay to — bank details so the customer can settle by BACS /
			// FPS without coming back to ask. Reads from
			// `venue.bank_details` (jsonb).
			renderBankBlock(venue?.bank_details),

			// SEGMENTS + FACILITIES TABLE
			React.createElement(Text, { style: styles.sectionTitle }, "Booking details"),
			React.createElement(
				View,
				{ style: styles.tableHead, fixed: true },
				headCell(C_WIDTHS.room, "Room"),
				headCell(C_WIDTHS.dates, "Date & time"),
				headCell(C_WIDTHS.basis, "Basis"),
				headCell(C_WIDTHS.rate, "Rate", { alignRight: true }),
				headCell(C_WIDTHS.qty, "Qty", { alignRight: true }),
				headCell(C_WIDTHS.subtotal, "Subtotal", { alignRight: true, last: true }),
			),
			...segments.map((s, i) => renderSegmentRow(s, i)),
			...facilities.map((f, i) => renderFacilityRow(f, i)),

			// FOOTER — subtotal, override discount, VAT, total. When no
			// override is applied AND no VAT, collapse to just the total.
			tfootRow({
				label: "Subtotal (standard rates)",
				value: fmtGbp(itemsSubtotal),
			}),
			hasOverride
				? tfootRow({
						label: booking.override_reason
							? `Discount — ${booking.override_reason}`
							: "Discount",
						value: `-${fmtGbp(discountCents)}`,
						discount: true,
					})
				: null,
			vatCents > 0
				? tfootRow({ label: "VAT", value: fmtGbp(vatCents) })
				: null,
			tfootRow({
				label: "Booking total",
				value: fmtGbp(effectiveTotal),
				strong: true,
				topBorder: true,
			}),

			// PER-PAYMENT MODE: "This invoice covers" callout pulling out
			// the specific slice. Big amount-due at the bottom = that slice.
			isPaymentInvoice
				? React.createElement(
						View,
						{ style: styles.sliceBox, wrap: false },
						React.createElement(Text, { style: styles.sliceLabel }, "This invoice covers"),
						React.createElement(
							View,
							{ style: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 } },
							React.createElement(Text, { style: styles.sliceTitle }, payment.label),
							React.createElement(Text, { style: styles.sliceValue }, fmtGbp(payment.amount_cents)),
						),
						payments.length > 1
							? React.createElement(
									Text,
									{ style: [styles.muted, { marginTop: 6, fontSize: 8 }] },
									`Part of a ${payments.length}-payment plan for booking ${booking.reference}.`,
								)
							: null,
					)
				: null,

			// BIG AMOUNT DUE
			React.createElement(
				View,
				{ style: styles.bigTotalBlock, wrap: false },
				React.createElement(Text, { style: styles.bigTotalLabel }, "Amount due"),
				React.createElement(
					View,
					{ style: styles.bigTotalValueWrap },
					React.createElement(Text, { style: styles.bigTotalValue }, fmtGbp(amountDueCents)),
				),
				React.createElement(
					Text,
					{ style: styles.bigTotalSub },
					isPaymentInvoice
						? `for ${payment.label} on booking ${booking.reference}`
						: `for booking ${booking.reference}`,
				),
			),

			React.createElement(
				Text,
				{ style: styles.footer },
				`Invoice issued by ${venue?.name ?? "the venue"}. Please contact us about anything that doesn't look right.`,
			),
		),
	);

	return renderToBuffer(doc);
}
