import { SiteHeader } from "@/site/layout/site-header";
import { SiteFooter } from "@/site/layout/site-footer";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPublicNavData } from "@/db/queries/public-nav";

export const dynamic = "force-dynamic";

export default async function OrganisersLayout({ children }) {
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
			<SiteFooter
				rooms={nav.rooms}
				hasUpcomingEvents={nav.hasUpcomingEvents}
				phone={venue.phone ?? null}
				contactEmail={venue.contact_email ?? null}
				addressLines={Array.isArray(venue.address_lines) ? venue.address_lines : null}
			/>
		</div>
	);
}
