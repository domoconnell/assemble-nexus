/**
 * Minimal public layout — no site header, no footer, just the site theme.
 * Used for "single-purpose" public pages where chrome would distract from
 * the one task on screen (e.g. wallet-bound ticket gallery).
 */
export const dynamic = "force-dynamic";

export default function PublicBareLayout({ children }) {
	return (
		<div className="theme-site min-h-svh bg-background text-foreground antialiased">
			{children}
		</div>
	);
}
