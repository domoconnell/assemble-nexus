import { getTicketForPdf } from "@/db/queries/orders.js";
import { getGoogleWalletSettings } from "@/db/queries/settings.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { getGoogleWalletSaveUrl } from "@/lib/wallets/google/pass-generator.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
	const { code } = await params;
	if (!code) return new Response("Missing code", { status: 400 });

	const ticket = await getTicketForPdf(code);
	if (!ticket) return new Response("Ticket not found", { status: 404 });
	if (ticket.order_status === "pending") {
		return new Response("Order not paid", { status: 402 });
	}

	const venue = await requireCurrentVenue();
	const settings = await getGoogleWalletSettings(venue.id);
	if (!settings?.issuer_id || !settings?.service_account_json) {
		return new Response("Google Wallet isn't configured for this venue.", {
			status: 503,
		});
	}

	let saveUrl;
	try {
		saveUrl = await getGoogleWalletSaveUrl({
			ticket,
			settings,
			baseUrl: process.env.BASE_URL,
		});
	} catch (err) {
		console.error("[wallet/google] save URL generation failed", err);
		return new Response(`Could not generate Google Wallet pass: ${err?.message ?? "error"}`, {
			status: 500,
		});
	}

	return Response.redirect(saveUrl, 302);
}
