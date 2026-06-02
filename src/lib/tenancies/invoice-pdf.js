import React from "react";
import {
	Document,
	Page,
	View,
	Text,
	StyleSheet,
	renderToBuffer,
} from "@react-pdf/renderer";

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

// Tailwind-ish proportions tuned for an A4 PDF row.
const C_WIDTHS = {
	room: 90,
	basis: 60,
	rate: 55,
	qty: 60,
	standardSub: 70,
	override: 70,
	reducedSub: 70,
	reduction: 60,
};

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
		marginBottom: 16,
		paddingBottom: 10,
		borderBottomWidth: 1,
		borderBottomColor: "#e2e8f0",
	},
	kicker: { fontSize: 8, letterSpacing: 3, textTransform: "uppercase", color: "#64748b" },
	venue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 3 },
	subRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
	subCell: { flexDirection: "column" },
	subLabel: { fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase", color: "#94a3b8" },
	subValue: { marginTop: 1, fontSize: 9 },

	tableHead: {
		flexDirection: "row",
		borderBottomWidth: 1,
		borderBottomColor: "#cbd5e1",
		paddingBottom: 4,
		marginBottom: 2,
		marginTop: 10,
	},
	tableHeadCell: { fontSize: 7, letterSpacing: 1.2, textTransform: "uppercase", color: "#64748b" },
	tableRow: {
		flexDirection: "row",
		borderBottomWidth: 0.5,
		borderBottomColor: "#e2e8f0",
		paddingVertical: 4,
	},
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
			// header
			React.createElement(
				View,
				{ style: styles.header },
				React.createElement(Text, { style: styles.kicker }, "Tenancy invoice"),
				React.createElement(Text, { style: styles.venue }, venue?.name ?? ""),
				React.createElement(
					View,
					{ style: styles.subRow },
					React.createElement(
						View,
						{ style: styles.subCell },
						React.createElement(Text, { style: styles.subLabel }, "Billed to"),
						React.createElement(Text, { style: styles.subValue }, tenancy?.organisation_name ?? "—"),
					),
					React.createElement(
						View,
						{ style: styles.subCell },
						React.createElement(Text, { style: styles.subLabel }, "Period"),
						React.createElement(Text, { style: styles.subValue }, period),
					),
					React.createElement(
						View,
						{ style: styles.subCell },
						React.createElement(Text, { style: styles.subLabel }, "Reference"),
						React.createElement(Text, { style: styles.subValue }, invoice.reference),
					),
					React.createElement(
						View,
						{ style: styles.subCell },
						React.createElement(Text, { style: styles.subLabel }, "Issued"),
						React.createElement(Text, { style: styles.subValue }, issued),
					),
				),
			),

			// table header
			React.createElement(
				View,
				{ style: styles.tableHead, fixed: true },
				React.createElement(Text, { style: [styles.tableHeadCell, { width: C_WIDTHS.room }] }, "Room"),
				React.createElement(Text, { style: [styles.tableHeadCell, { width: C_WIDTHS.basis }] }, "Rate basis"),
				React.createElement(
					Text,
					{ style: [styles.tableHeadCell, styles.cellRight, { width: C_WIDTHS.rate }] },
					"Rate",
				),
				React.createElement(
					Text,
					{ style: [styles.tableHeadCell, styles.cellRight, { width: C_WIDTHS.qty }] },
					"Quantity",
				),
				React.createElement(
					Text,
					{ style: [styles.tableHeadCell, styles.cellRight, { width: C_WIDTHS.standardSub }] },
					showReductionColumns ? "Std subtotal" : "Subtotal",
				),
				showReductionColumns
					? React.createElement(
						Text,
						{ style: [styles.tableHeadCell, { width: C_WIDTHS.override }] },
						"Override",
					)
					: null,
				showReductionColumns
					? React.createElement(
						Text,
						{ style: [styles.tableHeadCell, styles.cellRight, { width: C_WIDTHS.reducedSub }] },
						"Reduced sub",
					)
					: null,
				showReductionColumns
					? React.createElement(
						Text,
						{ style: [styles.tableHeadCell, styles.cellRight, { width: C_WIDTHS.reduction }] },
						"Reduction",
					)
					: null,
			),

			// rows
			...lines.map((l) => {
				const meta = lineRateBasis(l);
				const standardSub = l.rack_cents ?? l.amount_cents ?? 0;
				const reducedSub = l.amount_cents ?? 0;
				const reduction = l.discount_cents ?? 0;
				const reductionColor =
					reduction > 0 ? styles.primary : reduction < 0 ? styles.destructive : styles.muted;
				return React.createElement(
					View,
					{ key: l.id, style: styles.tableRow, wrap: false },
					React.createElement(Text, { style: { width: C_WIDTHS.room } }, l.description?.split(" — ")[0] ?? "—"),
					React.createElement(Text, { style: [styles.muted, { width: C_WIDTHS.basis }] }, meta.basis),
					React.createElement(
						Text,
						{ style: [styles.cellRight, { width: C_WIDTHS.rate }] },
						meta.rate,
					),
					React.createElement(
						Text,
						{ style: [styles.cellRight, styles.muted, { width: C_WIDTHS.qty }] },
						meta.quantity,
					),
					React.createElement(
						Text,
						{ style: [styles.cellRight, { width: C_WIDTHS.standardSub }] },
						fmtGbp(standardSub),
					),
					showReductionColumns
						? React.createElement(
							Text,
							{ style: [styles.muted, { width: C_WIDTHS.override }] },
							meta.override,
						)
						: null,
					showReductionColumns
						? React.createElement(
							Text,
							{ style: [styles.cellRight, { width: C_WIDTHS.reducedSub }] },
							fmtGbp(reducedSub),
						)
						: null,
					showReductionColumns
						? React.createElement(
							Text,
							{ style: [styles.cellRight, reductionColor, { width: C_WIDTHS.reduction }] },
							reduction === 0
								? "—"
								: `${reduction > 0 ? "−" : "+"}${fmtGbp(Math.abs(reduction))}`,
						)
						: null,
				);
			}),

			// totals (right-aligned blocks)
			React.createElement(
				View,
				{ style: { marginTop: 10 }, wrap: false },
				showReductionColumns
					? React.createElement(
						View,
						{ style: styles.tfootRow },
						React.createElement(View, { style: styles.tfootSpacer }),
						React.createElement(Text, { style: styles.tfootLabel }, "Standard rate total"),
						React.createElement(Text, { style: [styles.tfootValue, styles.tfootStrong] }, fmtGbp(standardRateTotal)),
						React.createElement(View, { style: styles.tfootValuePad }),
					)
					: null,
				showReductionColumns
					? React.createElement(
						View,
						{ style: styles.tfootRow },
						React.createElement(View, { style: styles.tfootSpacer }),
						React.createElement(Text, { style: styles.tfootLabel }, "Reduced total"),
						React.createElement(Text, { style: [styles.tfootValue, styles.tfootStrong] }, fmtGbp(reducedTotalEffective)),
						React.createElement(View, { style: styles.tfootValuePad }),
					)
					: hasFixedFeeAdjustment
						? React.createElement(
							View,
							{ style: styles.tfootRow },
							React.createElement(View, { style: styles.tfootSpacer }),
							React.createElement(Text, { style: styles.tfootLabel }, "Subtotal"),
							React.createElement(Text, { style: [styles.tfootValue, styles.tfootStrong] }, fmtGbp(reducedTotalEffective)),
							React.createElement(View, { style: styles.tfootValuePad }),
						)
						: null,
				hasFixedFeeAdjustment
					? React.createElement(
						View,
						{ style: styles.tfootRow },
						React.createElement(View, { style: styles.tfootSpacer }),
						React.createElement(Text, { style: styles.tfootLabel }, "Fixed fee adjustment"),
						React.createElement(
							Text,
							{
								style: [
									styles.tfootValue,
									fixedFeeAdjustment > 0
										? styles.primary
										: fixedFeeAdjustment < 0
											? styles.destructive
											: null,
								],
							},
							`${fixedFeeAdjustment > 0 ? "+" : fixedFeeAdjustment < 0 ? "−" : ""}${fmtGbp(Math.abs(fixedFeeAdjustment))}`,
						),
						React.createElement(View, { style: styles.tfootValuePad }),
					)
					: null,
				React.createElement(
					View,
					{ style: [styles.tfootRow, styles.tfootDivider] },
					React.createElement(View, { style: styles.tfootSpacer }),
					React.createElement(Text, { style: [styles.tfootLabel, styles.tfootStrong] }, "Grand total"),
					React.createElement(Text, { style: [styles.tfootValue, styles.tfootStrong] }, fmtGbp(grandTotalEffective)),
					React.createElement(View, { style: styles.tfootValuePad }),
				),
				hasReduction
					? React.createElement(
						View,
						{ style: styles.tfootRow },
						React.createElement(View, { style: styles.tfootSpacer }),
						React.createElement(Text, { style: [styles.tfootLabel, styles.tfootStrong] }, "Total reduction"),
						React.createElement(
							Text,
							{
								style: [
									styles.tfootValue,
									styles.tfootStrong,
									totalReduction > 0 ? styles.primary : styles.destructive,
								],
							},
							`${totalReduction > 0 ? "−" : "+"}${fmtGbp(Math.abs(totalReduction))}`,
						),
						React.createElement(View, { style: styles.tfootValuePad }),
					)
					: null,
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
