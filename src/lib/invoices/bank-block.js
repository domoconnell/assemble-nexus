import React from "react";
import { View, Text } from "@react-pdf/renderer";

/**
 * "Pay to" panel — venue's bank details so customers can settle by
 * BACS / FPS without having to come back and ask. Reads from
 * `venue.bank_details` (jsonb). Returns null when no details are set,
 * so venues that don't take bank transfer don't get an empty box.
 *
 * Shared across every invoice PDF builder (tenancy, booking, manual)
 * so the panel reads identically no matter which kind of invoice the
 * customer is looking at.
 */
const styles = {
	wrap: {
		marginTop: 12,
		marginBottom: 12,
		borderTopWidth: 0.5,
		borderTopColor: "#cbd5e1",
		borderBottomWidth: 0.5,
		borderBottomColor: "#cbd5e1",
		paddingVertical: 6,
		paddingHorizontal: 4,
	},
	head: {
		fontSize: 7,
		letterSpacing: 1.5,
		textTransform: "uppercase",
		color: "#64748b",
		marginBottom: 4,
	},
	grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
	cell: { flexDirection: "column", minWidth: 110 },
	label: {
		fontSize: 7,
		color: "#94a3b8",
		textTransform: "uppercase",
		letterSpacing: 1,
	},
	value: { fontSize: 9, marginTop: 1 },
	valueMono: { fontSize: 9, marginTop: 1, fontFamily: "Helvetica-Bold" },
};

const MONO_LABELS = new Set(["Sort code", "Account no.", "IBAN", "BIC"]);

export function renderBankBlock(bankDetails) {
	if (!bankDetails || (!bankDetails.account_number && !bankDetails.iban)) {
		return null;
	}
	const rows = [
		bankDetails.bank_name ? ["Bank", bankDetails.bank_name] : null,
		bankDetails.account_name ? ["Account name", bankDetails.account_name] : null,
		bankDetails.sort_code ? ["Sort code", bankDetails.sort_code] : null,
		bankDetails.account_number ? ["Account no.", bankDetails.account_number] : null,
		bankDetails.iban ? ["IBAN", bankDetails.iban] : null,
		bankDetails.bic ? ["BIC", bankDetails.bic] : null,
	].filter(Boolean);
	return React.createElement(
		View,
		{ style: styles.wrap, wrap: false },
		React.createElement(Text, { style: styles.head }, "Pay to"),
		React.createElement(
			View,
			{ style: styles.grid },
			...rows.map(([label, value]) =>
				React.createElement(
					View,
					{ key: label, style: styles.cell },
					React.createElement(Text, { style: styles.label }, label),
					React.createElement(
						Text,
						{ style: MONO_LABELS.has(label) ? styles.valueMono : styles.value },
						value,
					),
				),
			),
		),
	);
}
