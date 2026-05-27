import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { bank_account } from "@/db/schema/entities/bank_account.js";
import { requireCurrentVenue } from "@/db/queries/venue";
import { listBankAccounts } from "@/db/queries/bank";
import { exchangeAuthCode as exchangeMonzoAuthCode } from "@/lib/banking/providers/monzo.js";
import BankAccountsClient from "./_components/bank-accounts-client";

export const dynamic = "force-dynamic";

const NEXUS_STATE_PREFIX = "nexus:";

/**
 * If Monzo (or any future OAuth provider that uses the same convention)
 * redirected back to us with `?code=…&state=nexus:<bank_account_id>`,
 * complete the token exchange here and redirect to a clean URL. Means
 * the user doesn't have to copy-paste the code out of the address bar.
 *
 * Returns `{ status: "ok" | "error", message? }` once handled (or null
 * if there's no callback to handle).
 */
async function handleOauthCallback(searchParams, venueId) {
	const code = typeof searchParams?.code === "string" ? searchParams.code : null;
	const state = typeof searchParams?.state === "string" ? searchParams.state : null;
	if (!code || !state?.startsWith(NEXUS_STATE_PREFIX)) return null;

	const accountId = state.slice(NEXUS_STATE_PREFIX.length);
	const [account] = await db
		.select()
		.from(bank_account)
		.where(
			and(
				eq(bank_account.id, accountId),
				eq(bank_account.venue_id, venueId),
				isNull(bank_account.deletedAt),
			),
		)
		.limit(1);
	if (!account) {
		return { status: "error", message: "Couldn't match that callback to a bank account." };
	}

	if (account.provider === "monzo") {
		const res = await exchangeMonzoAuthCode(account.credentials, code);
		if (!res.ok) {
			return { status: "error", message: res.error || "Monzo rejected the code." };
		}
		await db
			.update(bank_account)
			.set({ credentials: res.credentials })
			.where(eq(bank_account.id, account.id));
		return { status: "ok", message: "Authorised. Approve the Monzo app card, then test the connection." };
	}

	return { status: "error", message: `Unknown provider in callback: ${account.provider}` };
}

export default async function BankAccountsSettingsPage({ searchParams }) {
	const venue = await requireCurrentVenue();
	const sp = await searchParams;
	const callback = await handleOauthCallback(sp, venue.id);

	// Strip the OAuth params from the URL after we've handled them, so a
	// page refresh doesn't try to re-exchange a now-burned code. We also
	// carry forward the bank_account id so the client can auto-open the
	// account-picker dialog and save the user a click.
	if (callback) {
		const params = new URLSearchParams();
		params.set("oauth", callback.status);
		if (callback.message) params.set("msg", callback.message);
		const callbackState = typeof sp?.state === "string" ? sp.state : "";
		if (callbackState.startsWith(NEXUS_STATE_PREFIX) && callback.status === "ok") {
			params.set("open", callbackState.slice(NEXUS_STATE_PREFIX.length));
		}
		redirect(`/admin/settings/bank-accounts?${params}`);
	}

	const accounts = await listBankAccounts(venue.id, { includeInactive: true });
	const oauthStatus = typeof sp?.oauth === "string" ? sp.oauth : null;
	const oauthMessage = typeof sp?.msg === "string" ? sp.msg : null;
	const openAccountId = typeof sp?.open === "string" ? sp.open : null;

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

			<BankAccountsClient
				accounts={accounts}
				oauthStatus={oauthStatus}
				oauthMessage={oauthMessage}
				openAccountId={openAccountId}
			/>
		</div>
	);
}
