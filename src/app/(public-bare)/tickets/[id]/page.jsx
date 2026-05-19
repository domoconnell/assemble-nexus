import { notFound } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { byPrefixAndName } from "@awesome.me/kit-71c392801a/icons";
import {
	getOrderForTicketGallery,
	listOrderTickets,
} from "@/db/queries/orders";
import { getWalletProvidersStatus } from "@/db/queries/settings";

const appleIcon = byPrefixAndName.fab["apple"];
const googleIcon = byPrefixAndName.fab["google-wallet"];

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

// UUID v4 sanity check so a typo returns 404 instead of triggering a DB query
// with an invalid cast.
function looksLikeUuid(s) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function generateMetadata({ params }) {
	const { id } = await params;
	if (!looksLikeUuid(id)) return { title: "Tickets - The Assembly Rooms" };
	const order = await getOrderForTicketGallery(id);
	return {
		title: order
			? `Tickets for ${order.event_title} - The Assembly Rooms`
			: "Tickets - The Assembly Rooms",
		robots: { index: false, follow: false },
	};
}

export default async function PublicTicketGalleryPage({ params }) {
	const { id } = await params;
	if (!looksLikeUuid(id)) notFound();

	const order = await getOrderForTicketGallery(id);
	if (!order) notFound();
	if (order.status !== "paid" && order.status !== "partially_refunded") {
		// Don't expose unpaid orders here.
		notFound();
	}

	const [tickets, walletStatus] = await Promise.all([
		listOrderTickets(order.id),
		getWalletProvidersStatus(order.venue_id),
	]);

	const start = order.event_starts_at ? new Date(order.event_starts_at) : null;
	const end = order.event_ends_at ? new Date(order.event_ends_at) : null;
	const doors = order.event_doors_open_at ? new Date(order.event_doors_open_at) : null;

	const timeRange =
		start && end ? `${timeFmt.format(start)}-${timeFmt.format(end)}` : start ? timeFmt.format(start) : "";
	const dateLine = start ? dateFmt.format(start) : "";
	const doorsLine = doors ? `Doors ${timeFmt.format(doors)}` : "";

	return (
		<main className="mx-auto px-5 py-6 max-w-xl">
			<header className="text-center space-y-1 mb-4">
				<div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
					Your tickets
				</div>
				<h1 className="font-display text-xl tracking-tight">{order.event_title}</h1>
				{(dateLine || timeRange || doorsLine) && (
					<p className="text-xs text-muted-foreground">
						{[dateLine, timeRange, doorsLine].filter(Boolean).join(" · ")}
					</p>
				)}
			</header>

			<ul className="space-y-3">
				{tickets.map((t, i) => (
					<TicketCard
						key={t.id}
						ticket={t}
						index={i}
						total={tickets.length}
						appleReady={walletStatus.apple_ready}
						googleReady={walletStatus.google_ready}
					/>
				))}
			</ul>

			<div className="pt-4 text-center">
				<a
					href={`/api/orders/${order.reference}/invoice`}
					className="text-xs text-muted-foreground hover:text-foreground underline"
				>
					Download invoice / receipt
				</a>
			</div>
		</main>
	);
}

function TicketCard({ ticket, index, total, appleReady, googleReady }) {
	const invalid = ticket.status !== "valid";
	return (
		<li className="rounded-xl border border-foreground/10 bg-card p-5 space-y-3">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div>
					<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
						Ticket {index + 1} of {total}
					</div>
					<div className="font-medium mt-0.5">
						{ticket.line_name_snapshot || "Ticket"}
					</div>
					{ticket.holder_name && (
						<div className="text-sm text-muted-foreground">{ticket.holder_name}</div>
					)}
					<div className="font-mono text-xs text-muted-foreground mt-1">
						{ticket.code}
					</div>
				</div>
				{invalid && (
					<span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em]">
						{ticket.status}
					</span>
				)}
			</div>
			{!invalid && (appleReady || googleReady) && (
				<div
					className={`grid gap-2 pt-2 border-t border-foreground/10 ${
						appleReady && googleReady ? "grid-cols-2" : "grid-cols-1"
					}`}
				>
					{appleReady && (
						<WalletButton
							href={`/wallet/apple/${ticket.code}`}
							icon={appleIcon}
							label="Add to Apple Wallet"
						/>
					)}
					{googleReady && (
						<WalletButton
							href={`/wallet/google/${ticket.code}`}
							icon={googleIcon}
							label="Add to Google Wallet"
						/>
					)}
				</div>
			)}
		</li>
	);
}

function WalletButton({ href, icon, label }) {
	return (
		<a
			href={href}
			className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 transition"
		>
			{icon && <FontAwesomeIcon icon={icon} className="h-4 w-4" />}
			<span>{label}</span>
		</a>
	);
}
