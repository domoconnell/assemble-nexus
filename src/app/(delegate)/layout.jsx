import { SiteHeader } from "@/site/layout/site-header";
import { SiteFooter } from "@/site/layout/site-footer";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPublicNavData } from "@/db/queries/public-nav";

export const dynamic = "force-dynamic";

/**
 * Layout for the delegate-facing portal — /my-tickets and /my-orders.
 *
 * Customer-facing chrome (site header + footer, no admin sidebar). Each
 * page inside this group decides for itself whether to show a magic-link
 * sign-in form or the user's data — the layout doesn't enforce auth, so
 * we never bounce out to the admin /auth/login page from here.
 */
export default async function DelegateLayout({ children }) {
	const venue = await requireCurrentVenue();
	const nav = await getPublicNavData(venue.id);

	const navItems = [];
	for (const r of nav.rooms) {
		navItems.push({ label: r.name, href: `/rooms/${r.slug}` });
	}
	if (nav.hasUpcomingEvents) navItems.push({ label: "What's On", href: "/whats-on" });
	navItems.push({ label: "About", href: "/about" });
	navItems.push({ label: "Contact", href: "/contact" });

	return (
		<div className="theme-site min-h-svh bg-background text-foreground antialiased">
			<SiteHeader navItems={navItems} />
			<main>{children}</main>
			<SiteFooter rooms={nav.rooms} hasUpcomingEvents={nav.hasUpcomingEvents} />
		</div>
	);
}
