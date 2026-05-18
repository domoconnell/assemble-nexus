import { requireCurrentVenue } from "@/db/queries/venue";
import { requireServerSession } from "@/utils/auth/server-guard.js";
import { currentMonthLondon } from "@/lib/finance/months";
import { buildBoardPackPdf } from "@/lib/board-pack/render.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
	await requireServerSession({ redirectTo: "/auth/login" });
	const venue = await requireCurrentVenue();

	const url = new URL(request.url);
	const requested = url.searchParams.get("month");
	const fallback = currentMonthLondon().ym;
	const ym = /^\d{4}-\d{2}$/.test(requested ?? "") ? requested : fallback;

	const { buffer } = await buildBoardPackPdf({
		venueId: venue.id,
		ym,
		venueName: venue.name,
	});

	const slug = (venue.slug || "venue").replace(/[^a-zA-Z0-9-]+/g, "-");
	const filename = `board-pack-${slug}-${ym}.pdf`;

	return new Response(buffer, {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "private, no-store",
		},
	});
}
