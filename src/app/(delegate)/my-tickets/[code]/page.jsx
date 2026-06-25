import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "@/utils/auth/server-guard";
import { getTicketForUserByCode } from "@/db/queries/orders";
import { getWalletProvidersStatus } from "@/db/queries/settings";
import { requireCurrentVenue } from "@/db/queries/venue";
import TicketQrCard from "@/site/events/ticket-qr-card";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "Europe/London",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

export async function generateMetadata({ params }) {
	const { code } = await params;
	return {
		title: `Ticket ${code} - The Assembly Rooms`,
		robots: { index: false, follow: false },
	};
}

export default async function MyTicketDetailPage({ params }) {
	const { code } = await params;
	// Auth + ownership are gated in /my-tickets/[code]/layout.jsx, but
	// Next renders layout and page in parallel — bail out cleanly when
	// session hasn't arrived yet rather than crashing on session.user.id.
	const session = await getServerSession();
	if (!session?.user) return null;
	const ticket = await getTicketForUserByCode(code, session.user.id);
	if (!ticket) notFound();

	const venue = await requireCurrentVenue();
	const walletStatus = await getWalletProvidersStatus(venue.id);

	const start = ticket.event_starts_at ? new Date(ticket.event_starts_at) : null;
	const end = ticket.event_ends_at ? new Date(ticket.event_ends_at) : null;
	const doors = ticket.event_doors_open_at ? new Date(ticket.event_doors_open_at) : null;

	return (
		<>
			<div className="rounded-xl border border-foreground/10 bg-card p-6 space-y-4">
					<div className="space-y-1">
						<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							When
						</div>
						<div className="font-display text-xl tracking-tight">
							{start ? dateFmt.format(start) : "Date TBA"}
						</div>
						{start && (
							<div className="text-sm text-muted-foreground">
								{end ? `${timeFmt.format(start)} - ${timeFmt.format(end)}` : timeFmt.format(start)}
								{doors && ` · Doors ${timeFmt.format(doors)}`}
							</div>
						)}
					</div>

					<div className="border-t border-foreground/10 pt-4 space-y-1">
						<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							Where
						</div>
						<div className="text-base">{ticket.venue_name || "The Assembly Rooms"}</div>
					</div>

					{ticket.holder_name && (
						<div className="border-t border-foreground/10 pt-4 space-y-1">
							<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
								Holder
							</div>
							<div className="text-base">{ticket.holder_name}</div>
						</div>
					)}

					<div className="border-t border-foreground/10 pt-4 space-y-1">
						<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							Order
						</div>
						<Link
							href={`/my-orders/${ticket.order_reference}`}
							className="font-mono text-sm hover:text-primary hover:underline"
						>
							{ticket.order_reference}
						</Link>
					</div>
				</div>

				<TicketQrCard
					name={ticket.ticket_type_label}
					code={ticket.code}
					status={ticket.status}
					appleReady={walletStatus.apple_ready}
					googleReady={walletStatus.google_ready}
				/>
		</>
	);
}
