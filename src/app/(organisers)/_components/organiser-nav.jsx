import Link from "next/link";
import { CircleUser } from "lucide-react";
import SignOutButton from "./sign-out-button";

export default function OrganiserNav({ current, email, redirectTo = "/my-bookings" }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<nav className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-card p-1 text-sm">
				<PillLink href="/my-bookings" active={current === "bookings"}>
					Bookings
				</PillLink>
				<PillLink href="/my-events" active={current === "events"}>
					Events
				</PillLink>
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
