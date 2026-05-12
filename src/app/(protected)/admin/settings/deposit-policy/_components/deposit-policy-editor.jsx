"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Label } from "@/shadcn/components/ui/label";
import { saveDepositPolicyAction } from "../actions";

export default function DepositPolicyEditor({ initialPolicy }) {
	const router = useRouter();
	const [policy, setPolicy] = useState(() => ({
		id: initialPolicy?.id ?? null,
		deposit_pct: initialPolicy ? initialPolicy.deposit_pct_x100 / 100 : 25,
		non_refundable_pct: initialPolicy ? initialPolicy.non_refundable_pct_x100 / 100 : 10,
		refundable_until_days_before: initialPolicy?.refundable_until_days_before ?? 14,
		notes: initialPolicy?.notes ?? "",
	}));
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState(null);
	const [error, setError] = useState(null);

	function update(field, value) {
		setPolicy((p) => ({ ...p, [field]: value }));
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			const saved = await saveDepositPolicyAction({
				id: policy.id,
				deposit_pct_x100: Math.round(Number(policy.deposit_pct) * 100),
				non_refundable_pct_x100: Math.round(Number(policy.non_refundable_pct) * 100),
				refundable_until_days_before: policy.refundable_until_days_before,
				notes: policy.notes,
			});
			setPolicy((p) => ({ ...p, id: saved.id }));
			setSavedAt(new Date());
			router.refresh();
		} catch (err) {
			setError(err?.message || "Save failed");
		} finally {
			setSaving(false);
		}
	}

	const exampleTotal = 1000;
	const exampleDeposit = (exampleTotal * Number(policy.deposit_pct || 0)) / 100;
	const exampleNonRefundable = (exampleTotal * Number(policy.non_refundable_pct || 0)) / 100;
	const exampleRefundable = exampleDeposit - exampleNonRefundable;

	return (
		<div className="space-y-6">
			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
					{error}
				</div>
			)}
			<div className="rounded-lg border bg-card p-6 space-y-5">
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="deposit_pct">Deposit (% of total)</Label>
						<Input
							id="deposit_pct"
							type="number"
							min="0"
							max="100"
							step="0.5"
							value={policy.deposit_pct}
							onChange={(e) => update("deposit_pct", e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="non_refundable_pct">Non-refundable (% of total)</Label>
						<Input
							id="non_refundable_pct"
							type="number"
							min="0"
							max="100"
							step="0.5"
							value={policy.non_refundable_pct}
							onChange={(e) => update("non_refundable_pct", e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Must be ≤ deposit %. The non-refundable element is forfeit on cancellation.
						</p>
					</div>
					<div className="space-y-2 sm:col-span-2">
						<Label htmlFor="refundable_until_days_before">
							Refundable up until N days before the event
						</Label>
						<Input
							id="refundable_until_days_before"
							type="number"
							min="0"
							value={policy.refundable_until_days_before}
							onChange={(e) => update("refundable_until_days_before", Number(e.target.value || 0))}
						/>
					</div>
					<div className="space-y-2 sm:col-span-2">
						<Label htmlFor="notes">Notes (internal)</Label>
						<Textarea
							id="notes"
							rows={3}
							value={policy.notes ?? ""}
							onChange={(e) => update("notes", e.target.value)}
						/>
					</div>
				</div>
				<div className="rounded-md border border-foreground/10 bg-background p-4 text-sm space-y-1">
					<p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Example on a £1,000 booking</p>
					<p>Deposit: <span className="font-mono">£{exampleDeposit.toFixed(2)}</span></p>
					<p>Of which non-refundable: <span className="font-mono">£{exampleNonRefundable.toFixed(2)}</span></p>
					<p>Of which refundable up to {policy.refundable_until_days_before} days before: <span className="font-mono">£{exampleRefundable.toFixed(2)}</span></p>
				</div>
				<div className="flex items-center justify-end gap-3">
					{savedAt && <span className="text-xs text-muted-foreground">Saved.</span>}
					<Button onClick={save} disabled={saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</div>
			</div>
		</div>
	);
}
