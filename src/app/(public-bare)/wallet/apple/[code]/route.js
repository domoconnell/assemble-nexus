import { getTicketForPdf } from "@/db/queries/orders.js";
import { getAppleWalletSettings } from "@/db/queries/settings.js";
import { requireCurrentVenue } from "@/db/queries/venue.js";
import { generateTicketPkPass } from "@/lib/wallets/apple/pass-generator.js";

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
	const settings = await getAppleWalletSettings(venue.id);
	if (
		!settings?.pass_type_identifier ||
		!settings?.team_identifier ||
		!settings?.signer_cert_pem ||
		!settings?.signer_key_pem
	) {
		return new Response("Apple Wallet isn't configured for this venue.", {
			status: 503,
		});
	}

	let buffer;
	try {
		buffer = await generateTicketPkPass({ ticket, settings });
	} catch (err) {
		console.error("[wallet/apple] pass generation failed", err);
		return new Response(`Could not generate pass: ${err?.message ?? "error"}`, {
			status: 500,
		});
	}

	return new Response(buffer, {
		status: 200,
		headers: {
			"Content-Type": "application/vnd.apple.pkpass",
			"Content-Disposition": `attachment; filename="ticket-${ticket.code}.pkpass"`,
			"Cache-Control": "private, no-store",
		},
	});
}
