import Link from "next/link";
import { CircleUser } from "lucide-react";
import SignOutButton from "@/app/(organisers)/_components/sign-out-button";

/**
 * Unified top-of-page pill nav for the customer-facing portals
 * (My Bookings, My Events, My Orders, My Tickets). Replaces the two
 * separate `OrganiserNav` / `DelegateNav` components.
 *
 * The pills sit in two visually separate groups:
 *   [ Bookings · Events ]  [ My Orders · My Tickets ]
 *
 * Each pill is gated by an explicit `show*` boolean so the caller
 * decides what's visible. An entire group is hidden if both of its
 * pills are hidden.
 *
 * Rule of thumb (the spec the host pages encode):
 *  - On /my-bookings + /my-events: always show all four.
 *  - On /my-orders + /my-tickets: Orders + Tickets always; Bookings
 *    and Events only when the user actually has any.
 */
export default function MyNav({
	current,
	email,
	redirectTo = "/my-bookings",
	showBookings = true,
	showEvents = true,
	showOrders = true,
	showTickets = true,
}) {
	const showHirerGroup = showBookings || showEvents;
	const showDelegateGroup = showOrders || showTickets;
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div className="flex flex-wrap items-center gap-2">
				{showHirerGroup && (
					<nav className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-card p-1 text-sm">
						{showBookings && (
							<PillLink href="/my-bookings" active={current === "bookings"}>
								Bookings
							</PillLink>
						)}
						{showEvents && (
							<PillLink href="/my-events" active={current === "events"}>
								Events
							</PillLink>
						)}
					</nav>
				)}
				{showDelegateGroup && (
					<nav className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-card p-1 text-sm">
						{showOrders && (
							<PillLink href="/my-orders" active={current === "orders"}>
								My Orders
							</PillLink>
						)}
						{showTickets && (
							<PillLink href="/my-tickets" active={current === "tickets"}>
								My Tickets
							</PillLink>
						)}
					</nav>
				)}
			</div>
			<div className="inline-flex items-center gap-2 text-sm">
				<CircleUser className="size-4 text-muted-foreground" aria-hidden />
				<span className="text-foreground/85 truncate max-w-[240px]">{email}</span>
				<span className="text-foreground/30" aria-hidden>
					·
				</span>
				<SignOutButton redirectTo={redirectTo} />
			</div>
		</div>
	);
}

function PillLink({ href, active, children }) {
	return (
		<Link
			href={href}
			aria-current={active ? "page" : undefined}
			className={`rounded-full px-4 py-1.5 transition ${
				active
					? "bg-primary/15 text-primary"
					: "text-muted-foreground hover:text-foreground"
			}`}
		>
			{children}
		</Link>
	);
}
