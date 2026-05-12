import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import {
	getTicketingSettings,
	getAppleWalletSettings,
	getGoogleWalletSettings,
} from "@/db/queries/settings";
import TicketingEditor from "./_components/ticketing-editor";
import AppleWalletEditor from "./_components/apple-wallet-editor";
import GoogleWalletEditor from "./_components/google-wallet-editor";

export const dynamic = "force-dynamic";

export default async function TicketingSettingsPage() {
	const venue = await requireCurrentVenue();
	const [ticketing, apple, google] = await Promise.all([
		getTicketingSettings(venue.id),
		getAppleWalletSettings(venue.id),
		getGoogleWalletSettings(venue.id),
	]);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-10">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Ticketing</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Per-ticket platform fees charged on top of ticket prices for events ticketed
					through The Assembly Rooms. Per-room setup fees are set on the room&apos;s Details tab.
				</p>
			</div>

			<div className="space-y-2">
				<h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
					Platform fees
				</h2>
				<TicketingEditor initial={ticketing} />
			</div>

			<div className="space-y-3">
				<h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
					Wallet passes
				</h2>
				<AppleWalletEditor initial={apple} />
				<GoogleWalletEditor initial={google} />
			</div>
		</div>
	);
}
