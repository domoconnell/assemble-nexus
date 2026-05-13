import { requireCurrentVenue } from "@/db/queries/venue";
import { getVatReturnRollup } from "@/db/queries/vat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseYmd(s) {
	if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
	const [y, m, d] = s.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function csvEscape(v) {
	if (v == null) return "";
	const s = String(v);
	if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

export async function GET(req) {
	const url = new URL(req.url);
	const fromYmd = url.searchParams.get("from");
	const toYmd = url.searchParams.get("to");
	const fromDate = parseYmd(fromYmd);
	const toDateInclusive = parseYmd(toYmd);
	if (!fromDate || !toDateInclusive) {
		return new Response("Provide from and to as YYYY-MM-DD.", { status: 400 });
	}
	// `to` is inclusive in the URL; shift one day to make it exclusive for the query
	const toDate = new Date(toDateInclusive.getTime() + 24 * 60 * 60 * 1000);

	const venue = await requireCurrentVenue();
	const rollup = await getVatReturnRollup(venue.id, { fromDate, toDate });

	const rows = [
		["Source", "Date basis", "Count", "Gross (£)", "VAT (£)", "Net (£)"],
		...rollup.streams.map((s) => [
			s.label,
			s.date_basis,
			s.count,
			(s.gross_cents / 100).toFixed(2),
			(s.vat_cents / 100).toFixed(2),
			(s.net_cents / 100).toFixed(2),
		]),
		[
			"TOTAL",
			"",
			"",
			(rollup.totals.gross_cents / 100).toFixed(2),
			(rollup.totals.vat_cents / 100).toFixed(2),
			(rollup.totals.net_cents / 100).toFixed(2),
		],
	];
	const body = rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";

	const filename = `vat-${fromYmd}-to-${toYmd}.csv`;
	return new Response(body, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "private, no-store",
		},
	});
}
