"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import {
	saveStarlingSettingsAction,
	clearStarlingSettingsAction,
	testStarlingSettingsAction,
	syncStarlingNowAction,
} from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export default function StarlingEditor({ initial }) {
	const router = useRouter();
	const [accessToken, setAccessToken] = useState("");
	const [accountUid, setAccountUid] = useState(initial?.account_uid ?? "");
	const [accountLabel, setAccountLabel] = useState(initial?.account_label ?? "");
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState(null);
	const [syncing, setSyncing] = useState(false);
	const [syncResult, setSyncResult] = useState(null);

	const isConfigured = Boolean(initial?.access_token && initial?.account_uid);

	async function save() {
		setSaving(true);
		setTestResult(null);
		try {
			await saveStarlingSettingsAction({
				access_token: accessToken || null,
				account_uid: accountUid,
				account_label: accountLabel || null,
			});
			toast.success("Bank account settings saved.");
			setAccessToken("");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't save");
		} finally {
			setSaving(false);
		}
	}

	async function test() {
		setTesting(true);
		setTestResult(null);
		try {
			const result = await testStarlingSettingsAction({
				access_token: accessToken || null,
				account_uid: accountUid,
			});
			setTestResult(result);
			if (result.ok) {
				toast.success(`Connected — balance ${gbp.format((result.cleared_cents ?? 0) / 100)}`);
			} else {
				toast.error(result.error || "Couldn't connect");
			}
		} catch (err) {
			toast.error(err?.message || "Couldn't test");
		} finally {
			setTesting(false);
		}
	}

	async function sync(force) {
		setSyncing(true);
		setSyncResult(null);
		try {
			const result = await syncStarlingNowAction({ force });
			setSyncResult(result);
			if (result.ok) {
				toast.success(`Synced — ${result.inserted} new, ${result.updated} updated.`);
				router.refresh();
			} else {
				toast.error(result.error || result.reason || "Sync failed.");
			}
		} catch (err) {
			toast.error(err?.message || "Sync failed");
		} finally {
			setSyncing(false);
		}
	}

	async function clear() {
		if (!confirm("Disconnect this bank account? You can reconnect anytime."))
			return;
		setSaving(true);
		try {
			await clearStarlingSettingsAction();
			toast.success("Disconnected.");
			setAccessToken("");
			setAccountUid("");
			setAccountLabel("");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't disconnect");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="rounded-lg border bg-card overflow-hidden">
			<header className="flex items-center justify-between gap-3 px-6 py-5 bg-linear-to-r from-[#6935D3]/10 via-[#8a3ffc]/5 to-transparent border-b border-foreground/10">
				<div className="flex items-center gap-3">
					<StarlingLogo />
					<div>
						<h2 className="text-sm font-semibold">Starling Bank</h2>
						<p className="text-xs text-muted-foreground">
							The only supported bank for now.
						</p>
					</div>
				</div>
				<span
					className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${
						isConfigured
							? "border-primary/30 bg-primary/10 text-primary"
							: "border-foreground/15 bg-muted text-muted-foreground"
					}`}
				>
					{isConfigured ? "Connected" : "Not connected"}
				</span>
			</header>

			<div className="p-6 space-y-5">
				<p className="text-sm text-muted-foreground max-w-prose">
					Paste a Personal Access Token from the{" "}
					<a
						href="https://developer.starlingbank.com/personal/list"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground hover:text-primary underline underline-offset-2"
					>
						Starling Developer Portal
					</a>
					{" "}and the Account UID for the account you want to read. We use this
					to read the balance — no transactions, no payments out.
				</p>

				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1.5 sm:col-span-2">
						<Label htmlFor="starling-token">
							Personal Access Token{" "}
							{isConfigured && (
								<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
									Optional · already saved
								</span>
							)}
						</Label>
						<Input
							id="starling-token"
							type="password"
							placeholder={isConfigured ? "Leave blank to keep existing token" : "eyJhbGciOi…"}
							value={accessToken}
							onChange={(e) => setAccessToken(e.target.value)}
							autoComplete="off"
						/>
						<p className="text-[11px] text-muted-foreground">
							Required scope: <span className="font-mono">balance:read</span>.
							Token is stored encrypted-at-rest in the database.
						</p>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="starling-account-uid">Account UID</Label>
						<Input
							id="starling-account-uid"
							placeholder="00000000-0000-0000-0000-000000000000"
							value={accountUid}
							onChange={(e) => setAccountUid(e.target.value)}
							autoComplete="off"
						/>
						<p className="text-[11px] text-muted-foreground">
							From <span className="font-mono">/api/v2/accounts</span> or the
							developer portal&apos;s account list.
						</p>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="starling-label">Account label (optional)</Label>
						<Input
							id="starling-label"
							placeholder="e.g. Main current account"
							value={accountLabel}
							onChange={(e) => setAccountLabel(e.target.value)}
						/>
						<p className="text-[11px] text-muted-foreground">
							Shown on the ledger dashboard so you know which account the
							balance is from.
						</p>
					</div>
				</div>

				{testResult && (
					<div
						className={`text-sm rounded-md border px-3 py-2 ${
							testResult.ok
								? "border-primary/30 bg-primary/5 text-foreground"
								: "border-destructive/30 bg-destructive/5 text-destructive"
						}`}
					>
						{testResult.ok ? (
							<>
								<span className="font-medium">Connection OK.</span>{" "}
								Cleared balance: <span className="font-mono">{gbp.format((testResult.cleared_cents ?? 0) / 100)}</span>
							</>
						) : (
							<>{testResult.error}</>
						)}
					</div>
				)}
			</div>

			<div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-foreground/10 bg-muted/30">
				{isConfigured && (
					<Button variant="outline" onClick={clear} disabled={saving || testing || syncing}>
						Disconnect
					</Button>
				)}
				<Button
					variant="outline"
					onClick={test}
					disabled={saving || testing || syncing || !accountUid}
				>
					{testing ? "Testing…" : "Test connection"}
				</Button>
				<Button onClick={save} disabled={saving || testing || syncing || !accountUid}>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>

			{isConfigured && (
				<div className="px-6 py-5 border-t border-foreground/10 space-y-3">
					<div className="flex items-baseline justify-between gap-3 flex-wrap">
						<div>
							<h3 className="text-sm font-semibold">Sync transactions</h3>
							<p className="text-xs text-muted-foreground mt-0.5">
								{initial?.last_synced_at
									? `Last synced ${new Date(initial.last_synced_at).toLocaleString("en-GB")}.`
									: "Never synced yet. Run a backfill to pull historic transactions."}
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								onClick={() => sync(true)}
								disabled={syncing || saving || testing}
							>
								{syncing ? "Syncing…" : "Backfill (13 months)"}
							</Button>
							<Button
								onClick={() => sync(false)}
								disabled={syncing || saving || testing}
							>
								{syncing ? "Syncing…" : "Sync now"}
							</Button>
						</div>
					</div>
					{syncResult && (
						<div
							className={`text-sm rounded-md border px-3 py-2 ${
								syncResult.ok
									? "border-primary/30 bg-primary/5 text-foreground"
									: "border-destructive/30 bg-destructive/5 text-destructive"
							}`}
						>
							{syncResult.ok ? (
								<>
									Synced {syncResult.inserted} new + {syncResult.updated} updated
									transactions
									{syncResult.balance &&
										` · balance ${gbp.format((syncResult.balance.cleared_minor ?? 0) / 100)}`}
									.
								</>
							) : (
								<>{syncResult.error || syncResult.reason}</>
							)}
						</div>
					)}
				</div>
			)}
		</section>
	);
}

function StarlingLogo() {
	// Drop the official Starling press logo at public/starling-logo.svg to
	// replace this. Until then, a branded badge in Starling's purple.
	return (
		<div
			className="inline-flex items-center justify-center h-10 w-10 rounded-lg text-white"
			style={{
				background: "linear-gradient(135deg, #6935D3 0%, #8a3ffc 100%)",
			}}
			aria-label="Starling Bank"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				className="h-5 w-5"
				aria-hidden
			>
				<path
					d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
					fill="currentColor"
				/>
			</svg>
		</div>
	);
}
