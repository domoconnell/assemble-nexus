import Link from "next/link";
import { CircleUser } from "lucide-react";
import SignOutButton from "@/app/(organisers)/_components/sign-out-button";

/**
 * Unified top-of-page pill nav for the customer-facing portals
 * (My Bookings, My Events, My Orders, My Tickets). Replaces the two
 * separate `OrganiserNav` / `DelegateNav` components.
 *
 * The four pills are always rendered in a fixed order:
 * Bookings → Events → Orders → Tickets. Each one is gated by an
 * explicit `show*` boolean so the caller decides what's visible.
 *
 * Rule of thumb (the spec the host pages encode):
 *  - On /my-bookings + /my-events: always show all four (Orders and
 *    Tickets surface even when the user has none — gives a single
 *    coherent header across the whole "my…" surface).
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
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
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
				{showOrders && (
					<PillLink href="/my-orders" active={current === "orders"}>
						Orders
					</PillLink>
				)}
				{showTickets && (
					<PillLink href="/my-tickets" active={current === "tickets"}>
						Tickets
					</PillLink>
				)}
			</nav>
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
