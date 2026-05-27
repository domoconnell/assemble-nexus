"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/shadcn/components/ui/dialog";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import StarlingForm from "./starling-form";
import RevolutForm from "./revolut-form";
import MonzoForm from "./monzo-form";
import StripeBankForm from "./stripe-bank-form";
import {
	deleteBankAccountAction,
	setBankAccountActiveAction,
	syncBankAccountNowAction,
	buildMonzoReauthUrlAction,
} from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

const PROVIDER_OPTIONS = [
	{ key: "starling", label: "Starling Bank", blurb: "Personal Access Token. Single-account hire, simplest setup." },
	{ key: "revolut", label: "Revolut Business", blurb: "Certificate-based OAuth. Supports multi-currency sub-accounts." },
	{ key: "monzo", label: "Monzo", blurb: "OAuth client. Personal + Business accounts. Needs in-app approval after setup." },
	{ key: "stripe", label: "Stripe balance", blurb: "Surface funds currently held by Stripe (pre-payout) as a bank line. Re-uses your PSP Stripe key." },
];

const PROVIDER_LABELS = {
	starling: "Starling",
	revolut: "Revolut",
	monzo: "Monzo",
	stripe: "Stripe",
};

export default function BankAccountsClient({ accounts, oauthStatus, oauthMessage, openAccountId }) {
	const router = useRouter();
	const [addOpen, setAddOpen] = useState(false);
	const [chosenProvider, setChosenProvider] = useState(null);
	const [editing, setEditing] = useState(null); // bank_account row
	const [confirmDeleteId, setConfirmDeleteId] = useState(null);
	const [syncingId, setSyncingId] = useState(null);

	// After a successful OAuth callback, the server hands us the
	// bank_account id to open. Auto-open the edit dialog on mount so the
	// user lands straight on step 3 (pick which Monzo account to link)
	// instead of having to click Edit themselves.
	const oauthShownRef = useRef(false);
	useEffect(() => {
		if (oauthShownRef.current) return;
		if (!oauthStatus && !openAccountId) return;
		oauthShownRef.current = true;
		if (oauthStatus === "ok") {
			toast.success(oauthMessage || "Authorised.");
		} else if (oauthStatus === "error") {
			toast.error(oauthMessage || "OAuth callback failed.");
		}
		if (openAccountId) {
			const target = accounts.find((a) => a.id === openAccountId);
			if (target) {
				setChosenProvider(target.provider);
				setEditing(target);
			}
		}
		// Replace URL without the oauth params - in-page only, no fetch.
		if (typeof window !== "undefined") {
			window.history.replaceState({}, "", "/admin/settings/bank-accounts");
		}
	}, [oauthStatus, oauthMessage, openAccountId, accounts]);

	function openAdd(provider) {
		setChosenProvider(provider);
		setEditing(null);
	}

	function openEdit(account) {
		setChosenProvider(account.provider);
		setEditing(account);
	}

	function closeForm() {
		setChosenProvider(null);
		setEditing(null);
		setAddOpen(false);
		router.refresh();
	}

	async function toggleActive(account) {
		try {
			await setBankAccountActiveAction({ id: account.id, is_active: !account.is_active });
			toast.success(account.is_active ? "Account disabled." : "Account enabled.");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't update");
		}
	}

	async function sync(account, force = false) {
		setSyncingId(account.id);
		try {
			const result = await syncBankAccountNowAction({ id: account.id, force });
			if (result.ok) {
				toast.success(
					`Synced - ${result.inserted} new, ${result.updated} updated${result.backfilled ? `, ${result.backfilled} balance points` : ""}.`,
				);
				router.refresh();
			} else {
				toast.error(result.error || result.reason || "Sync failed.");
			}
		} catch (err) {
			toast.error(err?.message || "Sync failed");
		} finally {
			setSyncingId(null);
		}
	}

	async function reauthoriseMonzo(account) {
		try {
			const res = await buildMonzoReauthUrlAction({ id: account.id });
			if (!res?.url) throw new Error("Couldn't build re-authorise URL.");
			// Navigate in the same tab - Monzo redirects back to the same
			// page, and our auto-callback handler picks the flow up there.
			window.location.href = res.url;
		} catch (err) {
			toast.error(err?.message || "Couldn't start re-authorisation");
		}
	}

	async function performDelete(id) {
		try {
			await deleteBankAccountAction({ id });
			toast.success("Bank account removed.");
			setConfirmDeleteId(null);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't remove");
		}
	}

	return (
		<>
			<div className="space-y-3">
				{accounts.length === 0 ? (
					<div className="rounded-xl border border-dashed border-foreground/15 bg-card p-10 text-center space-y-4">
						<h2 className="font-display text-xl tracking-tight">No bank accounts connected yet.</h2>
						<p className="text-sm text-muted-foreground max-w-md mx-auto">
							Add one and balances + transactions will start syncing nightly.
						</p>
						<Button onClick={() => setAddOpen(true)}>Add bank account</Button>
					</div>
				) : (
					<>
						<ul className="space-y-2">
							{accounts.map((a) => (
								<AccountRow
									key={a.id}
									account={a}
									onEdit={() => openEdit(a)}
									onSync={() => sync(a, false)}
									onBackfill={() => sync(a, true)}
									onToggleActive={() => toggleActive(a)}
									onDelete={() => setConfirmDeleteId(a.id)}
									onReauthMonzo={() => reauthoriseMonzo(a)}
									syncing={syncingId === a.id}
								/>
							))}
						</ul>
						<div className="flex justify-end pt-2">
							<Button variant="outline" onClick={() => setAddOpen(true)}>
								Add bank account
							</Button>
						</div>
					</>
				)}
			</div>

			<Dialog open={addOpen} onOpenChange={setAddOpen}>
				<DialogContent className="p-6 sm:p-8 space-y-5 max-w-lg">
					<DialogHeader>
						<DialogTitle>Add bank account</DialogTitle>
						<DialogDescription>
							Pick the provider that issued the account.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-3">
						{PROVIDER_OPTIONS.map((p) => (
							<button
								key={p.key}
								type="button"
								onClick={() => {
									openAdd(p.key);
									setAddOpen(false);
								}}
								className="text-left rounded-lg border border-foreground/10 bg-background px-4 py-4 hover:border-foreground/30 transition"
							>
								<div className="font-medium">{p.label}</div>
								<p className="text-sm text-muted-foreground mt-1">{p.blurb}</p>
							</button>
						))}
					</div>
				</DialogContent>
			</Dialog>

			{chosenProvider === "starling" && (
				<StarlingForm
					open
					onOpenChange={(o) => !o && closeForm()}
					initial={editing}
				/>
			)}
			{chosenProvider === "revolut" && (
				<RevolutForm
					open
					onOpenChange={(o) => !o && closeForm()}
					initial={editing}
				/>
			)}
			{chosenProvider === "monzo" && (
				<MonzoForm
					open
					onOpenChange={(o) => !o && closeForm()}
					initial={editing}
				/>
			)}
			{chosenProvider === "stripe" && (
				<StripeBankForm
					open
					onOpenChange={(o) => !o && closeForm()}
					initial={editing}
				/>
			)}

			<ConfirmDialog
				open={!!confirmDeleteId}
				onOpenChange={(o) => !o && setConfirmDeleteId(null)}
				title="Remove this bank account?"
				description="Existing transactions and balance snapshots are kept but you'll stop receiving syncs from this account."
				confirmLabel="Remove"
				destructive
				onConfirm={() => confirmDeleteId && performDelete(confirmDeleteId)}
			/>
		</>
	);
}

function AccountRow({ account, onEdit, onSync, onBackfill, onToggleActive, onDelete, onReauthMonzo, syncing }) {
	const providerLabel = PROVIDER_LABELS[account.provider] ?? account.provider;
	const lastSynced = account.last_synced_at ? new Date(account.last_synced_at) : null;
	const err = account.last_sync_error || "";
	// Monzo loses SCA periodically. When that happens, the sync error
	// contains a recognisable phrase - surface a prominent Re-authorise
	// button so the admin can fix it in two clicks. Outside of that we
	// keep Re-authorise as a quiet menu option for Monzo only.
	const needsReauth =
		account.provider === "monzo" &&
		/verification_required|Strong Customer Authentication|re-authorise|bad_access_token/i.test(err);
	return (
		<li className="rounded-lg border border-foreground/10 bg-card p-4 space-y-3">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div className="min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="font-medium">{account.label}</span>
						<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground rounded-full border border-foreground/15 px-2 py-0.5">
							{providerLabel}
						</span>
						{!account.is_active && (
							<span className="text-[10px] uppercase tracking-[0.18em] text-destructive rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5">
								Disabled
							</span>
						)}
						{needsReauth && (
							<span className="text-[10px] uppercase tracking-[0.18em] rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5">
								Needs re-auth
							</span>
						)}
					</div>
					<div className="text-xs text-muted-foreground mt-1">
						{account.currency} · {account.external_account_uid ? <span className="font-mono">{account.external_account_uid.slice(0, 8)}…</span> : "Not yet linked"}
						{lastSynced ? <> · Last synced {lastSynced.toLocaleString("en-GB")}</> : null}
					</div>
					{account.last_sync_error && (
						<div className="text-xs text-destructive mt-1">{account.last_sync_error}</div>
					)}
				</div>
				<div className="flex items-center gap-2">
					{needsReauth && (
						<Button size="sm" onClick={onReauthMonzo} disabled={syncing}>
							Re-authorise
						</Button>
					)}
					<Button variant="outline" size="sm" onClick={onEdit} disabled={syncing}>
						Edit
					</Button>
					<Button variant="outline" size="sm" onClick={onSync} disabled={syncing || !account.external_account_uid}>
						{syncing ? "Syncing…" : "Sync"}
					</Button>
					<Button variant="outline" size="sm" onClick={onBackfill} disabled={syncing || !account.external_account_uid}>
						Backfill
					</Button>
					{account.provider === "monzo" && !needsReauth && (
						<Button variant="ghost" size="sm" onClick={onReauthMonzo} disabled={syncing}>
							Re-authorise
						</Button>
					)}
					<Button variant="ghost" size="sm" onClick={onToggleActive} disabled={syncing}>
						{account.is_active ? "Disable" : "Enable"}
					</Button>
					<Button variant="ghost" size="sm" onClick={onDelete} disabled={syncing}>
						Remove
					</Button>
				</div>
			</div>
		</li>
	);
}
