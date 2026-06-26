"use client";

import { useState } from "react";
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
	saveSquareBankAccountAction,
	probeSquareBankAccountAction,
} from "../actions";

/**
 * Single-step Square setup. Paste a Square access token, the server probes
 * it (lists locations) and stashes the first active location's id for the
 * /v2/payouts queries that follow.
 */
export default function SquareBankForm({ open, onOpenChange, initial }) {
	const router = useRouter();
	const isEditing = !!initial;
	const existingCreds = initial?.credentials ?? {};
	const hasSavedToken = Boolean(existingCreds.access_token);

	const [label, setLabel] = useState(initial?.label ?? "Square balance");
	const [accessToken, setAccessToken] = useState("");
	const [busy, setBusy] = useState(false);

	async function save() {
		setBusy(true);
		try {
			const res = await saveSquareBankAccountAction({
				id: initial?.id ?? null,
				label: label.trim(),
				access_token: accessToken || null,
			});
			toast.success(isEditing ? "Saved." : "Square balance linked.");
			try {
				await probeSquareBankAccountAction({ id: res.id });
			} catch { /* probe is informational only */ }
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
					<DialogTitle>
						{isEditing ? "Edit Square balance" : "Link Square balance"}
					</DialogTitle>
					<DialogDescription>
						Surfaces the cash currently held by Square (charges that
						haven&apos;t yet paid out to your bank) as its own line in the
						dashboard and ledger. Payouts to Monzo are auto-paired as
						internal transfers so the totals don&apos;t double up.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="sq-label">Label</Label>
						<Input
							id="sq-label"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="sq-token">
							Square access token{" "}
							{hasSavedToken && (
								<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
									Optional · already saved
								</span>
							)}
						</Label>
						<Input
							id="sq-token"
							type="password"
							placeholder={
								hasSavedToken
									? "Leave blank to keep the existing token"
									: "EAAA…"
							}
							value={accessToken}
							onChange={(e) => setAccessToken(e.target.value)}
							autoComplete="off"
						/>
						<p className="text-[11px] text-muted-foreground">
							Production tokens start with{" "}
							<span className="font-mono">EAAAEjs…</span>; sandbox tokens
							start with <span className="font-mono">EAAAlxq…</span>. Issue
							one from the Square Developer dashboard under your application
							&rsquo;s OAuth tab.
						</p>
					</div>
				</div>

				<div className="flex justify-end gap-2 pt-2 border-t border-foreground/10">
					<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
						Cancel
					</Button>
					<Button onClick={save} disabled={busy || !label}>
						{busy ? "Saving…" : isEditing ? "Save changes" : "Link Square balance"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
