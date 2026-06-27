import React from "react";
import { View, Text } from "@react-pdf/renderer";

/**
 * Compact "Payment information" cell, designed to slot into an invoice
 * PDF's existing meta row alongside Billed to / Reference / Issued.
 * Reads from `venue.bank_details` (jsonb). Returns null when no
 * details are set so venues that don't take bank transfer don't end
 * up with an empty cell.
 *
 * Each PDF passes in its own `cellStyle`, `labelStyle` and `valueStyle`
 * so the cell matches the surrounding meta cells exactly — typography
 * varies between the tenancy / booking / manual PDFs.
 */
export function renderBankMetaCell(bankDetails, { cellStyle, labelStyle, valueStyle, mutedValueStyle }) {
	if (!bankDetails || (!bankDetails.account_number && !bankDetails.iban)) {
		return null;
	}
	const { bank_name, account_name, sort_code, account_number, iban } = bankDetails;
	const idLine =
		sort_code && account_number
			? `${sort_code} · ${account_number}`
			: account_number || iban || "";
	// The other meta cells are sized to fit "Newark Choral Society" or
	// "TI-2026-FKIK", but the account name is usually significantly
	// longer ("THE ASSEMBLY ROOMS NEWARK LIMITED"). Stretch this cell
	// wider so the name doesn't wrap mid-word.
	const widerCellStyle = Array.isArray(cellStyle)
		? [...cellStyle, { maxWidth: 200 }]
		: [cellStyle, { maxWidth: 200 }];
	return React.createElement(
		View,
		{ style: widerCellStyle, key: "pay-to" },
		React.createElement(Text, { style: labelStyle }, "Payment information"),
		bank_name
			? React.createElement(Text, { style: valueStyle }, bank_name)
			: null,
		account_name
			? React.createElement(Text, { style: valueStyle }, account_name)
			: null,
		idLine
			? React.createElement(
					Text,
					{
						style: [
							mutedValueStyle ?? valueStyle,
							{ fontFamily: "Helvetica-Bold" },
						],
					},
					idLine,
				)
			: null,
	);
}
