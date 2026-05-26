/**
 * Robots policy for the whole site.
 *
 * Allow crawling of the public marketing surface by default. Block:
 *   /admin           - tenant/staff console
 *   /api             - server APIs are not for indexing
 *   /auth            - auth flows (login screens etc.)
 *   /tenancy         - private tenancy-portal pages (no-chrome flows)
 *   /tickets         - per-ticket gallery (per-user)
 *   /my-*            - signed-in delegate/organiser portals
 *   /calendar        - room calendar (gated by an obscurity key; keep it
 *                      out of search results regardless)
 */
export default function robots() {
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: [
					"/admin",
					"/api",
					"/auth",
					"/tenancy",
					"/tickets",
					"/my-bookings",
					"/my-events",
					"/my-orders",
					"/my-tickets",
					"/calendar",
				],
			},
		],
	};
}
