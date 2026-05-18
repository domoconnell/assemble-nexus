import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { BoardPackDocument } from "./document.jsx";
import { gatherBoardPackData } from "./data.js";

/**
 * Build the board-pack PDF for a (venue, month). Returns a Buffer that
 * can be streamed as an HTTP response or attached to an email. Used by
 * both the admin "Board pack" download link and the monthly cron.
 */
export async function buildBoardPackPdf({ venueId, ym, venueName }) {
	const data = await gatherBoardPackData({ venueId, ym, venueName });
	const buffer = await renderToBuffer(React.createElement(BoardPackDocument, { data }));
	return { buffer, data };
}
