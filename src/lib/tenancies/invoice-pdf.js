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

const monthFmt = new Intl.DateTimeFormat("en-GB", {
	month: "long",
	year: "numeric",
	timeZone: "Europe/London",
});

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "Europe/London",
});

function formatHoursLabel(minutes) {
	if (!minutes || minutes <= 0) return "0 hours";
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m} mins`;
	if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
	return `${h}h ${m}m`;
}

// A4 = 595pt wide. Page padding is 36 each side → 523pt usable.
// Column widths sum to 520 to leave a little safety margin.
const C_WIDTHS = {
	room: 80,
	basis: 55,
	rate: 50,
	qty: 60,
	standardSub: 70,
	override: 70,
	reducedSub: 70,
	reduction: 65,
};
const TOTAL_TABLE_WIDTH = Object.values(C_WIDTHS).reduce((s, v) => s + v, 0);

const styles = StyleSheet.create({
	page: {
		padding: 36,
		paddingTop: 40,
		fontFamily: "Helvetica",
		fontSize: 8,
		color: "#0f172a",
		lineHeight: 1.35,
	},
	header: {
		marginBottom: 16,
		paddingBottom: 10,
		borderBottomWidth: 1,
		borderBottomColor: "#e2e8f0",
	},
	headerTopRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
	},
	logo: { width: 150, height: 42, objectFit: "contain" },
	bigTotalBlock: {
		alignItems: "center",
		marginTop: 30,
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
	// Wrap the value in a fixed-height row so the period text below can't
	// crash up into it. react-pdf doesn't always reserve enough vertical
	// space for very large fonts under the page-level lineHeight.
	bigTotalValueWrap: {
		height: 46,
		marginTop: 8,
		marginBottom: 8,
		justifyContent: "center",
	},
	bigTotalValue: {
		fontSize: 36,
		fontFamily: "Helvetica-Bold",
		lineHeight: 1,
	},
	bigTotalPeriod: { fontSize: 10, color: "#64748b" },
	subRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, gap: 10, flexWrap: "wrap" },
	subCell: { flexDirection: "column" },
	subLabel: { fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase", color: "#94a3b8" },
	subValue: { marginTop: 1, fontSize: 9 },

	tableHead: {
		flexDirection: "row",
		borderTopWidth: 0.5,
		borderTopColor: "#cbd5e1",
		borderBottomWidth: 1,
		borderBottomColor: "#cbd5e1",
		marginTop: 10,
	},
	tableHeadCell: {
		fontSize: 6.5,
		letterSpacing: 1,
		textTransform: "uppercase",
		color: "#64748b",
		paddingHorizontal: 3,
		paddingVertical: 4,
		borderRightWidth: 0.5,
		borderRightColor: "#e2e8f0",
	},
	tableHeadCellLast: { borderRightWidth: 0 },
	tableRow: {
		flexDirection: "row",
		borderBottomWidth: 0.5,
		borderBottomColor: "#e2e8f0",
	},
	tableCell: {
		paddingHorizontal: 3,
		paddingVertical: 4,
		borderRightWidth: 0.5,
		borderRightColor: "#e2e8f0",
	},
	tableCellLast: { borderRightWidth: 0 },
	cellLeft: { textAlign: "left" },
	cellRight: { textAlign: "right" },
	muted: { color: "#64748b" },
	mono: { fontFamily: "Helvetica" },
	primary: { color: "#0a7d3a" },
	destructive: { color: "#b91c1c" },

	tfootRow: {
		flexDirection: "row",
		paddingVertical: 3,
	},
	tfootSpacer: { flexGrow: 1 },
	tfootLabel: {
		width: 130,
		paddingRight: 8,
		textAlign: "right",
		color: "#475569",
	},
	tfootValue: {
		width: C_WIDTHS.reducedSub,
		textAlign: "right",
	},
	tfootValuePad: {
		width: C_WIDTHS.reduction,
	},
	tfootStrong: { fontFamily: "Helvetica-Bold" },
	tfootDivider: {
		borderTopWidth: 0.75,
		borderTopColor: "#cbd5e1",
		marginTop: 4,
		paddingTop: 4,
	},

	footer: { marginTop: 22, fontSize: 8, color: "#64748b" },
});

function periodLabel(periodYm) {
	if (!periodYm) return "";
	const [y, m] = periodYm.split("-").map(Number);
	return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

function lineRateBasis(l) {
	if (l.kind === "occupancy") {
		return {
			basis: "Occupancy",
			rate: l.unit_cents != null ? fmtGbp(l.unit_cents) : fmtGbp(l.amount_cents),
			quantity: "1 month",
			override: "",
		};
	}
	// scheduled
	const hasRack = l.rack_hourly_rate_cents != null && l.rack_cents != null;
	if (hasRack) {
		// quantity = total minutes covered by sessions, derived from rack:
		// rack_cents = (minutes/60) * rack_hourly_rate
		const minutes = Math.round((l.rack_cents / l.rack_hourly_rate_cents) * 60);
		let override = "";
		if (l.billing_mode === "per_hour" && l.unit_cents != null) {
			override = `${fmtGbp(l.unit_cents)}/hour`;
		} else if (l.billing_mode === "per_session" && l.unit_cents != null) {
			override = `${fmtGbp(l.unit_cents)}/session`;
		} else if (l.billing_mode === "fixed_monthly") {
			override = `${fmtGbp(l.amount_cents)} fixed`;
		}
		return {
			basis: "Hourly",
			rate: fmtGbp(l.rack_hourly_rate_cents),
			quantity: formatHoursLabel(minutes),
			override,
		};
	}
	// scheduled without a rack rate — show the line's own billing as the standard
	if (l.billing_mode === "per_session" && l.unit_cents != null) {
		const count = l.quantity ?? 0;
		return {
			basis: "Per session",
			rate: fmtGbp(l.unit_cents),
			quantity: `${count} session${count === 1 ? "" : "s"}`,
			override: "",
		};
	}
	if (l.billing_mode === "per_hour" && l.unit_cents != null) {
		const minutes = l.quantity ?? 0;
		return {
			basis: "Hourly",
			rate: fmtGbp(l.unit_cents),
			quantity: formatHoursLabel(minutes),
			override: "",
		};
	}
	return {
		basis: "Fixed monthly",
		rate: fmtGbp(l.amount_cents),
		quantity: "1 month",
		override: "",
	};
}

/**
 * The Room column reads from the existing line `description` field since
 * `tenancy_invoice_line` doesn't persist `room_name` as a separate column.
 * Descriptions are built by billing.js as either:
 *   "{Room} — full-time occupancy"        (occupancy)
 *   "{Room}: 32 hours × £14.30/hr"        (scheduled)
 *   "{Room} — {label}: …"                 (scheduled with label)
 */
function roomNameFromLine(line) {
	if (line.room_name) return line.room_name;
	const desc = line.description || "";
	const dashIdx = desc.indexOf(" — ");
	const colonIdx = desc.indexOf(":");
	let cut = -1;
	if (dashIdx !== -1 && (colonIdx === -1 || dashIdx < colonIdx)) cut = dashIdx;
	else if (colonIdx !== -1) cut = colonIdx;
	return cut >= 0 ? desc.substring(0, cut) : desc || "—";
}

function renderTableHead(showReductionColumns) {
	const headCell = (width, label, opts = {}) => {
		const isLast = opts.last;
		const styleArr = [
			styles.tableHeadCell,
			opts.alignRight ? styles.cellRight : null,
			{ width },
			isLast ? styles.tableHeadCellLast : null,
		].filter(Boolean);
		return React.createElement(Text, { style: styleArr }, label);
	};
	return React.createElement(
		View,
		{ style: styles.tableHead, fixed: true },
		headCell(C_WIDTHS.room, "Room"),
		headCell(C_WIDTHS.basis, "Rate basis"),
		headCell(C_WIDTHS.rate, "Rate", { alignRight: true }),
		headCell(C_WIDTHS.qty, "Qty", { alignRight: true }),
		headCell(
			C_WIDTHS.standardSub,
			showReductionColumns ? "Std subtotal" : "Subtotal",
			{ alignRight: true, last: !showReductionColumns },
		),
		showReductionColumns ? headCell(C_WIDTHS.override, "Override") : null,
		showReductionColumns
			? headCell(C_WIDTHS.reducedSub, "Reduced sub", { alignRight: true })
			: null,
		showReductionColumns
			? headCell(C_WIDTHS.reduction, "Reduction", { alignRight: true, last: true })
			: null,
	);
}

function renderRow(l, idx, showReductionColumns, total) {
	const meta = lineRateBasis(l);
	const standardSub = l.rack_cents ?? l.amount_cents ?? 0;
	const reducedSub = l.amount_cents ?? 0;
	const reduction = l.discount_cents ?? 0;
	const reductionColor =
		reduction > 0 ? styles.primary : reduction < 0 ? styles.destructive : styles.muted;
	// Keep the bottom border on every body row including the last — the
	// "Standard rate total" row sits directly below and needs a divider
	// between them.
	const cell = (width, value, opts = {}) =>
		React.createElement(
			Text,
			{
				style: [
					styles.tableCell,
					opts.alignRight ? styles.cellRight : null,
					opts.muted ? styles.muted : null,
					opts.colour ?? null,
					{ width },
					opts.last ? styles.tableCellLast : null,
				].filter(Boolean),
			},
			value,
		);
	return React.createElement(
		View,
		{ key: l.id, style: styles.tableRow, wrap: false },
		cell(C_WIDTHS.room, roomNameFromLine(l)),
		cell(C_WIDTHS.basis, meta.basis, { muted: true }),
		cell(C_WIDTHS.rate, meta.rate, { alignRight: true }),
		cell(C_WIDTHS.qty, meta.quantity, { alignRight: true, muted: true }),
		cell(C_WIDTHS.standardSub, fmtGbp(standardSub), { alignRight: true, last: !showReductionColumns }),
		showReductionColumns ? cell(C_WIDTHS.override, meta.override, { muted: true }) : null,
		showReductionColumns ? cell(C_WIDTHS.reducedSub, fmtGbp(reducedSub), { alignRight: true }) : null,
		showReductionColumns
			? cell(
				C_WIDTHS.reduction,
				reduction === 0
					? "—"
					: `${reduction > 0 ? "−" : "+"}${fmtGbp(Math.abs(reduction))}`,
				{ alignRight: true, colour: reductionColor, last: true },
			)
			: null,
	);
}

/**
 * Build the footer rows for the PDF invoice table. Mirrors the layout of
 * the on-screen preview's tfoot:
 *   - "Standard rate total" label sits in the Quantity column, value in
 *     the Standard rate subtotal column. "Reduced total" label in the
 *     Override column, value in the Reduced subtotal column. (Same row.)
 *   - Fixed fee adjustment, Grand total, Total reduction below — all
 *     right-aligned to the Reduced subtotal column.
 */
function buildFooterRows({
	showReductionColumns,
	standardRateTotal,
	reducedTotalEffective,
	hasFixedFeeAdjustment,
	fixedFeeAdjustment,
	grandTotalEffective,
	hasReduction,
	totalReduction,
}) {
	const rows = [];
	const cellMuted = { color: "#475569" };
	const cellStrong = { fontFamily: "Helvetica-Bold" };
	const cellBase = {
		paddingHorizontal: 3,
		paddingVertical: 3,
		borderRightWidth: 0.5,
		borderRightColor: "#e2e8f0",
	};

	function pad(width, extra = null) {
		return React.createElement(View, { style: [{ width }, extra].filter(Boolean) });
	}
	function labelCell(width, value, extra = null, opts = {}) {
		const styleArr = [
			cellBase,
			styles.cellRight,
			{ width },
			cellMuted,
			extra,
			opts.last ? styles.tableCellLast : null,
		].filter(Boolean);
		return React.createElement(Text, { style: styleArr }, value);
	}
	function valueCell(width, value, extra = null, opts = {}) {
		const styleArr = [
			cellBase,
			styles.cellRight,
			{ width },
			extra,
			opts.last ? styles.tableCellLast : null,
		].filter(Boolean);
		return React.createElement(Text, { style: styleArr }, value);
	}

	const ROW_HEIGHT_STYLE = { borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", flexDirection: "row" };

	if (showReductionColumns) {
		// Standard rate total label spans Rate+Qty cols, value in Std subtotal.
		// Reduced total label in Override col, value in Reduced sub col.
		rows.push(
			React.createElement(
				View,
				{ key: "ftr-totals", style: ROW_HEIGHT_STYLE },
				pad(C_WIDTHS.room, { ...cellBase }),
				pad(C_WIDTHS.basis, { ...cellBase }),
				labelCell(C_WIDTHS.rate + C_WIDTHS.qty, "Standard rate total"),
				valueCell(C_WIDTHS.standardSub, fmtGbp(standardRateTotal), cellStrong),
				labelCell(C_WIDTHS.override, "Reduced total"),
				valueCell(C_WIDTHS.reducedSub, fmtGbp(reducedTotalEffective), cellStrong),
				pad(C_WIDTHS.reduction, { ...cellBase, borderRightWidth: 0 }),
			),
		);
	} else if (hasFixedFeeAdjustment) {
		rows.push(
			React.createElement(
				View,
				{ key: "ftr-subtotal", style: ROW_HEIGHT_STYLE },
				pad(C_WIDTHS.room, { ...cellBase }),
				pad(C_WIDTHS.basis, { ...cellBase }),
				labelCell(C_WIDTHS.rate + C_WIDTHS.qty, "Subtotal"),
				valueCell(C_WIDTHS.standardSub, fmtGbp(reducedTotalEffective), cellStrong, { last: true }),
			),
		);
	}

	if (hasFixedFeeAdjustment && showReductionColumns) {
		const sign = fixedFeeAdjustment > 0 ? "−" : "+";
		const colour =
			fixedFeeAdjustment > 0
				? styles.primary
				: fixedFeeAdjustment < 0
					? styles.destructive
					: null;
		// Label spans Std subtotal + Override (merged), value in Reduced sub.
		rows.push(
			React.createElement(
				View,
				{ key: "ftr-ffa", style: ROW_HEIGHT_STYLE },
				pad(C_WIDTHS.room, { ...cellBase }),
				pad(C_WIDTHS.basis, { ...cellBase }),
				pad(C_WIDTHS.rate, { ...cellBase }),
				pad(C_WIDTHS.qty, { ...cellBase }),
				labelCell(C_WIDTHS.standardSub + C_WIDTHS.override, "Fixed fee adjustment"),
				valueCell(C_WIDTHS.reducedSub, `${sign}${fmtGbp(Math.abs(fixedFeeAdjustment))}`, colour),
				pad(C_WIDTHS.reduction, { ...cellBase, borderRightWidth: 0 }),
			),
		);
	}

	// Grand total — bold, with a thicker top border to set it apart.
	rows.push(
		React.createElement(
			View,
			{
				key: "ftr-grand",
				style: [
					ROW_HEIGHT_STYLE,
					{ borderTopWidth: 1, borderTopColor: "#cbd5e1" },
				],
			},
			pad(C_WIDTHS.room, { ...cellBase }),
			pad(C_WIDTHS.basis, { ...cellBase }),
			pad(C_WIDTHS.rate, { ...cellBase }),
			pad(C_WIDTHS.qty, { ...cellBase }),
			labelCell(C_WIDTHS.standardSub + C_WIDTHS.override, "Grand total", cellStrong),
			valueCell(C_WIDTHS.reducedSub, fmtGbp(grandTotalEffective), cellStrong),
			pad(C_WIDTHS.reduction, { ...cellBase, borderRightWidth: 0 }),
		),
	);

	if (hasReduction && showReductionColumns) {
		const sign = totalReduction > 0 ? "−" : "+";
		const colour = totalReduction > 0 ? styles.primary : styles.destructive;
		rows.push(
			React.createElement(
				View,
				{ key: "ftr-total-red", style: ROW_HEIGHT_STYLE },
				pad(C_WIDTHS.room, { ...cellBase }),
				pad(C_WIDTHS.basis, { ...cellBase }),
				pad(C_WIDTHS.rate, { ...cellBase }),
				pad(C_WIDTHS.qty, { ...cellBase }),
				labelCell(C_WIDTHS.standardSub + C_WIDTHS.override, "Total reduction"),
				valueCell(
					C_WIDTHS.reducedSub,
					`${sign}${fmtGbp(Math.abs(totalReduction))}`,
					[colour, cellStrong],
				),
				pad(C_WIDTHS.reduction, { ...cellBase, borderRightWidth: 0 }),
			),
		);
	}

	return rows;
}

export async function buildTenancyInvoicePdfBuffer({ invoice, lines, tenancy, venue }) {
	const period = periodLabel(invoice.period_ym);
	const issued = invoice.issued_at
		? dateFmt.format(new Date(invoice.issued_at))
		: "";

	const standardRateTotal = invoice.rack_subtotal_cents ?? invoice.subtotal_cents ?? 0;
	const grandTotalEffective = invoice.subtotal_cents ?? 0;
	const uncapped = invoice.uncapped_subtotal_cents;
	const reducedTotalEffective = uncapped != null ? uncapped : grandTotalEffective;
	const fixedFeeAdjustment = reducedTotalEffective - grandTotalEffective;
	const totalReduction = standardRateTotal - grandTotalEffective;

	const hasFixedFeeAdjustment = uncapped != null;
	const hasReduction = totalReduction !== 0;
	// If no line has a reduction, collapse Override/Reduced/Reduction
	// columns and call the standard subtotal just "Subtotal".
	const showReductionColumns = lines.some((l) => (l.discount_cents ?? 0) !== 0);

	const doc = React.createElement(
		Document,
		{ title: `Tenancy invoice ${invoice.reference}` },
		React.createElement(
			Page,
			{ size: "A4", style: styles.page },
			// Shared invoice header: logo + venue From block on top row,
			// 4-cell meta row underneath. Identical across every PDF.
			renderInvoiceHeader({
				logoPath: LOGO_PATH,
				venue,
				billedTo: {
					name: tenancy?.organisation_name ?? "—",
					lines: Array.isArray(tenancy?.organisation_address_lines)
						? tenancy.organisation_address_lines
						: [],
					vat: tenancy?.organisation_vat_number ?? null,
				},
				reference: invoice.reference,
				// Tenancy invoices show the period as a sub-line under the
				// reference — it's a tenancy-specific bit of context.
				referenceSub: period,
				issued,
			}),

			// table header
			renderTableHead(showReductionColumns),

			// rows
			...lines.map((l, idx) => renderRow(l, idx, showReductionColumns, lines.length)),

			// totals — siblings of the body rows so they flow as one
			// continuous table (no wrapping View / no marginTop = no gap).
			...buildFooterRows({
				showReductionColumns,
				standardRateTotal,
				reducedTotalEffective,
				hasFixedFeeAdjustment,
				fixedFeeAdjustment,
				grandTotalEffective,
				hasReduction,
				totalReduction,
			}),

			// big centred total at the bottom of the invoice
			React.createElement(
				View,
				{ style: styles.bigTotalBlock, wrap: false },
				React.createElement(Text, { style: styles.bigTotalLabel }, "Amount due"),
				React.createElement(
					View,
					{ style: styles.bigTotalValueWrap },
					React.createElement(Text, { style: styles.bigTotalValue }, fmtGbp(grandTotalEffective)),
				),
				React.createElement(Text, { style: styles.bigTotalPeriod }, `for ${period}`),
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
