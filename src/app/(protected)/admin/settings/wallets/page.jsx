import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import {
	getAppleWalletSettings,
	getGoogleWalletSettings,
} from "@/db/queries/settings";
import AppleWalletEditor from "./_components/apple-wallet-editor";
import GoogleWalletEditor from "./_components/google-wallet-editor";

export const dynamic = "force-dynamic";

export default async function WalletsSettingsPage() {
	const venue = await requireCurrentVenue();
	const [apple, google] = await Promise.all([
		getAppleWalletSettings(venue.id),
		getGoogleWalletSettings(venue.id),
	]);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-10">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Wallets &amp; passes</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Apple Wallet and Google Wallet credentials for issuing event tickets as
					mobile passes.
				</p>
			</div>

			<div className="space-y-3">
				<AppleWalletEditor initial={apple} />
				<GoogleWalletEditor initial={google} />
			</div>
		</div>
	);
}
