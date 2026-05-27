"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/shadcn/components/ui/dialog";
import {
	saveStripeBankAccountAction,
	probeStripeBankAccountAction,
	hasStripePspKeyAction,
} from "../actions";

/**
 * Single-step Stripe-balance setup. We pre-fill from the venue's PSP
 * Stripe key by default - most admins won't need to paste anything.
 */
export default function StripeBankForm({ open, onOpenChange, initial }) {
	const router = useRouter();
	const isEditing = !!initial;
	const existingCreds = initial?.credentials ?? {};
	const hasSavedKey = Boolean(existingCreds.secret_key);

	const [label, setLabel] = useState(initial?.label ?? "Stripe balance");
	const [secretKey, setSecretKey] = useState("");
	const [busy, setBusy] = useState(false);
	const [pspKeyInfo, setPspKeyInfo] = useState(null);

	useEffect(() => {
		if (!open || isEditing) return;
		(async () => {
			try {
				const res = await hasStripePspKeyAction();
				if (res?.ok) setPspKeyInfo({ has: res.has_key, env: res.env });
			} catch {
				// Non-fatal - just means we can't pre-fill the hint.
			}
		})();
	}, [open, isEditing]);

	async function save() {
		setBusy(true);
		try {
			const res = await saveStripeBankAccountAction({
				id: initial?.id ?? null,
				label: label.trim(),
				secret_key: secretKey || null,
			});
			toast.success(isEditing ? "Saved." : "Stripe balance linked.");
			// Run probe immediately so the user knows it's working without
			// having to click Sync.
			try {
				await probeStripeBankAccountAction({ id: res.id });
			} catch { /* probe is informational only */ }
			router.refresh();
			onOpenChange(false);
		} catch (err) {
			toast.error(err?.message || "Couldn't save");
		} finally {
			setBusy(false);
		}
	}

	const usingExisting = !isEditing && !secretKey && pspKeyInfo?.has;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="p-6 sm:p-8 space-y-5 max-w-lg">
				<DialogHeader>
					<DialogTitle>{isEditing ? "Edit Stripe balance" : "Link Stripe balance"}</DialogTitle>
					<DialogDescription>
						Surfaces the cash currently held by Stripe (charges that
						haven&apos;t yet paid out to your bank) as its own line in the
						dashboard and ledger. Payouts to Starling / Monzo etc. are
						auto-tagged as internal transfers, so totals don&apos;t double up.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="sb-label">Label</Label>
						<Input
							id="sb-label"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="sb-key">
							Stripe secret key{" "}
							{(hasSavedKey || usingExisting) && (
								<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
									Optional · {hasSavedKey ? "already saved" : "will use Settings → Payments key"}
								</span>
							)}
						</Label>
						<Input
							id="sb-key"
							type="password"
							placeholder={
								hasSavedKey
									? "Leave blank to keep the existing key"
									: usingExisting
										? `Leave blank to use the saved ${pspKeyInfo?.env || ""} key`
										: "sk_live_… or sk_test_…"
							}
							value={secretKey}
							onChange={(e) => setSecretKey(e.target.value)}
							autoComplete="off"
						/>
						<p className="text-[11px] text-muted-foreground">
							Same key shape as the PSP one. Restricted keys with{" "}
							<span className="font-mono">balance:read</span> +{" "}
							<span className="font-mono">balance_transaction:read</span> are
							sufficient.
						</p>
					</div>
				</div>

				<div className="flex justify-end gap-2 pt-2 border-t border-foreground/10">
					<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
						Cancel
					</Button>
					<Button onClick={save} disabled={busy || !label}>
						{busy ? "Saving…" : isEditing ? "Save changes" : "Link Stripe balance"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
