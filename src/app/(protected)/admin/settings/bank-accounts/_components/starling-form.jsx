"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shadcn/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/shadcn/components/ui/dialog";
import {
	saveStarlingAccountAction,
	listStarlingAccountsAction,
} from "../actions";

const ACCOUNT_PICKER_NONE = "__none__";

export default function StarlingForm({ open, onOpenChange, initial }) {
	const router = useRouter();
	const [label, setLabel] = useState(initial?.label ?? "");
	const [accessToken, setAccessToken] = useState("");
	const [accountUid, setAccountUid] = useState(initial?.external_account_uid ?? "");
	const [discovered, setDiscovered] = useState([]);
	const [busy, setBusy] = useState(false);

	const isEditing = !!initial;

	async function lookupAccounts() {
		const token = accessToken.trim();
		if (!token) {
			toast.error("Paste a token first.");
			return;
		}
		setBusy(true);
		try {
			const res = await listStarlingAccountsAction({ access_token: token });
			if (!res.ok) {
				toast.error(res.error || `Starling ${res.status}`);
				setDiscovered([]);
				return;
			}
			setDiscovered(res.accounts);
			if (res.accounts.length === 1 && !accountUid) {
				setAccountUid(res.accounts[0].accountUid);
			}
			toast.success(`Found ${res.accounts.length} account${res.accounts.length === 1 ? "" : "s"}.`);
		} catch (err) {
			toast.error(err?.message || "Couldn't list accounts");
		} finally {
			setBusy(false);
		}
	}

	async function save() {
		setBusy(true);
		try {
			await saveStarlingAccountAction({
				id: initial?.id ?? null,
				label: label.trim(),
				access_token: accessToken || null,
				account_uid: accountUid.trim(),
			});
			toast.success(isEditing ? "Saved." : "Starling account connected.");
			router.refresh();
			onOpenChange(false);
		} catch (err) {
			toast.error(err?.message || "Couldn't save");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="p-6 sm:p-8 space-y-5 max-w-lg">
				<DialogHeader>
					<DialogTitle>{isEditing ? "Edit Starling account" : "Add Starling account"}</DialogTitle>
					<DialogDescription>
						Paste a Personal Access Token from the{" "}
						<a
							href="https://developer.starlingbank.com/personal/list"
							target="_blank"
							rel="noopener noreferrer"
							className="underline underline-offset-2"
						>
							Starling Developer Portal
						</a>
						{" "}- scopes <span className="font-mono">balance:read</span> and{" "}
						<span className="font-mono">transaction:read</span>.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="st-label">Label</Label>
						<Input
							id="st-label"
							placeholder="e.g. Main current account"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="st-token">
							Personal Access Token{" "}
							{isEditing && (
								<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
									Optional · already saved
								</span>
							)}
						</Label>
						<Input
							id="st-token"
							type="password"
							placeholder={isEditing ? "Leave blank to keep existing token" : "eyJhbGciOi…"}
							value={accessToken}
							onChange={(e) => setAccessToken(e.target.value)}
							autoComplete="off"
						/>
					</div>
					<div className="space-y-1.5">
						<div className="flex items-baseline justify-between gap-2">
							<Label htmlFor="st-acct">Account UID</Label>
							<button
								type="button"
								onClick={lookupAccounts}
								disabled={busy || !accessToken}
								className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition disabled:opacity-50"
							>
								{busy ? "Looking up…" : "List accounts on this token"}
							</button>
						</div>
						{discovered.length > 0 ? (
							<Select
								value={accountUid || ACCOUNT_PICKER_NONE}
								onValueChange={(v) => setAccountUid(v === ACCOUNT_PICKER_NONE ? "" : v)}
							>
								<SelectTrigger>
									<SelectValue placeholder="Pick an account" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ACCOUNT_PICKER_NONE}>-</SelectItem>
									{discovered.map((a) => (
										<SelectItem key={a.accountUid} value={a.accountUid}>
											{a.name} · {a.currency} · {a.accountType}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<Input
								id="st-acct"
								placeholder="00000000-0000-0000-0000-000000000000"
								value={accountUid}
								onChange={(e) => setAccountUid(e.target.value)}
							/>
						)}
					</div>
				</div>

				<div className="flex justify-end gap-2 pt-2 border-t border-foreground/10">
					<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
						Cancel
					</Button>
					<Button onClick={save} disabled={busy || !label || !accountUid}>
						{busy ? "Saving…" : "Save"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
