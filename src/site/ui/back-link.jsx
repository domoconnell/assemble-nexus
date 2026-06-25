import Link from "next/link";

/**
 * Standard "back to X" link rendered at the top of any child page
 * under one of the customer surfaces (/my-bookings, /my-events,
 * /my-orders, /my-tickets). Always sits just below the layout's
 * MyNav pill so the user picks up the same affordance regardless of
 * which surface they're on.
 */
export function BackLink({ href, children, className = "" }) {
	return (
		<Link
			href={href}
			className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition ${className}`}
		>
			← {children}
		</Link>
	);
}
