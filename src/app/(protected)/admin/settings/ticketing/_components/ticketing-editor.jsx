"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { saveTicketingSettingsAction } from "../actions";

export default function TicketingEditor({ initial }) {
	const router = useRouter();
	const [pct, setPct] = useState((initial?.platform_fee_pct_x100 ?? 0) / 100);
	const [flat, setFlat] = useState((initial?.platform_fee_flat_cents ?? 0) / 100);
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState(null);
	const [error, setError] = useState(null);

	async function save() {
		setSaving(true);
		setError(null);
		try {
			await saveTicketingSettingsAction({
				platform_fee_pct_x100: Math.round(Number(pct || 0) * 100),
				platform_fee_flat_cents: Math.round(Number(flat || 0) * 100),
			});
			setSavedAt(new Date());
			router.refresh();
		} catch (err) {
			setError(err?.message || "Save failed");
		} finally {
			setSaving(false);
		}
	}

	const fmt = (cents) =>
		new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(cents / 100);
	const exampleTickets = [500, 1000, 2000, 3000, 5000, 10000];
	const calcFee = (priceCents) =>
		Math.round(priceCents * (Number(pct || 0) / 100)) + Math.round(Number(flat || 0) * 100);

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
						<Label htmlFor="pct">Per-ticket platform fee (%)</Label>
						<Input
							id="pct"
							type="number"
							min="0"
							max="100"
							step="0.1"
							value={pct}
							onChange={(e) => setPct(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">Percentage of each ticket&apos;s price.</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="flat">Per-ticket flat fee (£)</Label>
						<Input
							id="flat"
							type="number"
							min="0"
							step="0.01"
							value={flat}
							onChange={(e) => setFlat(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">Fixed amount per ticket on top of the percentage.</p>
					</div>
				</div>
				<div className="rounded-md border border-foreground/10 bg-background p-4 text-sm">
					<p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
						Example platform fees
					</p>
					<table className="w-full">
						<thead>
							<tr className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
								<th className="text-left font-medium pb-2">Ticket price</th>
								<th className="text-right font-medium pb-2">Platform fee</th>
								<th className="text-right font-medium pb-2">Customer pays / promoter receives</th>
							</tr>
						</thead>
						<tbody>
							{exampleTickets.map((p) => {
								const fee = calcFee(p);
								return (
									<tr key={p} className="border-t border-foreground/10">
										<td className="py-1.5 font-mono">{fmt(p)}</td>
										<td className="py-1.5 text-right font-mono">{fmt(fee)}</td>
										<td className="py-1.5 text-right font-mono text-muted-foreground">
											{fmt(p)} → {fmt(p - fee)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
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
