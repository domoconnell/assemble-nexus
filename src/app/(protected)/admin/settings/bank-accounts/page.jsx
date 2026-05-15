import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { listBankAccounts } from "@/db/queries/bank";
import BankAccountsClient from "./_components/bank-accounts-client";

export const dynamic = "force-dynamic";

export default async function BankAccountsSettingsPage() {
	const venue = await requireCurrentVenue();
	const accounts = await listBankAccounts(venue.id, { includeInactive: true });

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-8">
			<div>
				<Link
					href="/admin/settings"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Bank accounts</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Connect one or more of the venue&apos;s bank accounts. Balances and
					transactions across all connected accounts feed the dashboard, the
					ledger overview, and the Banking page (where you can toggle which
					accounts each metric includes).
				</p>
			</div>

			<BankAccountsClient accounts={accounts} />
		</div>
	);
}
