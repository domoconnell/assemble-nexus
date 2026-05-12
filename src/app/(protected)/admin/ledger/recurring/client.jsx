"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import {
	setRecurringCostScheduleAction,
	deleteRecurringCostScheduleAction,
} from "./actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const monthFmt = new Intl.DateTimeFormat("en-GB", {
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});
function formatYmdMonth(ymd) {
	if (!ymd) return "—";
	const [y, m] = ymd.split("-").map(Number);
	return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

function pad(n) {
	return String(n).padStart(2, "0");
}
function currentMonthYm() {
	const now = new Date();
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

export default function RecurringCostsClient({ sections }) {
	return (
		<div className="space-y-8">
			{sections.map((s) => (
				<Section key={s.type} section={s} />
			))}
		</div>
	);
}

function Section({ section }) {
	const [pending, startTransition] = useTransition();
	const [editing, setEditing] = useState(false);
	const [amountStr, setAmountStr] = useState("");
	const [ym, setYm] = useState(currentMonthYm());
	const [notes, setNotes] = useState("");
	const [confirmId, setConfirmId] = useState(null);

	function save(e) {
		e?.preventDefault();
		const amount = Number(amountStr);
		if (Number.isNaN(amount) || amount < 0) {
			toast.error("Enter a valid amount");
			return;
		}
		startTransition(async () => {
			try {
				await setRecurringCostScheduleAction({
					type: section.type,
					effective_from_ym: ym,
					amount_pounds: amount,
					notes: notes || null,
				});
				toast.success(`${section.label} updated from ${formatYmdMonth(`${ym}-01`)}`);
				setEditing(false);
				setAmountStr("");
				setNotes("");
				setYm(currentMonthYm());
			} catch (err) {
				toast.error(err?.message || "Couldn't save");
			}
		});
	}

	function remove(id) {
		startTransition(async () => {
			try {
				await deleteRecurringCostScheduleAction(id);
				toast.success("Removed");
			} catch (err) {
				toast.error(err?.message || "Couldn't remove");
			}
			setConfirmId(null);
		});
	}

	return (
		<section className="rounded-lg border bg-card p-6 space-y-5">
			<div className="flex items-baseline justify-between gap-4 flex-wrap">
				<div className="min-w-0">
					<h2 className="font-display text-xl tracking-tight">{section.label}</h2>
					<p className="text-sm text-muted-foreground mt-1">{section.description}</p>
				</div>
				<div className="text-right">
					<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
						In effect this month
					</div>
					<div className="font-display text-2xl">{fmt(section.current)}</div>
				</div>
			</div>

			{editing ? (
				<form onSubmit={save} className="space-y-3 border-t border-foreground/10 pt-5">
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor={`${section.type}-from`}>From month</Label>
							<Input
								id={`${section.type}-from`}
								type="month"
								value={ym}
								onChange={(e) => setYm(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${section.type}-amt`}>Monthly amount (£)</Label>
							<Input
								id={`${section.type}-amt`}
								type="number"
								inputMode="decimal"
								min="0"
								step="0.01"
								value={amountStr}
								onChange={(e) => setAmountStr(e.target.value)}
								placeholder="0.00"
								required
							/>
						</div>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={`${section.type}-notes`}>Notes (optional)</Label>
						<Input
							id={`${section.type}-notes`}
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="What changed and why"
						/>
					</div>
					<div className="flex gap-2">
						<Button type="submit" disabled={pending}>
							{pending ? "Saving…" : "Save"}
						</Button>
						<Button type="button" variant="ghost" onClick={() => setEditing(false)}>
							Cancel
						</Button>
					</div>
				</form>
			) : (
				<Button type="button" variant="outline" onClick={() => setEditing(true)}>
					Update from a month
				</Button>
			)}

			{section.history.length > 0 && (
				<div className="border-t border-foreground/10 pt-5">
					<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-2">
						History
					</div>
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-xs text-muted-foreground">
								<th className="py-1.5 font-normal">From</th>
								<th className="py-1.5 font-normal">Amount</th>
								<th className="py-1.5 font-normal">Notes</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{section.history.map((row) => (
								<tr key={row.id} className="border-t border-foreground/5">
									<td className="py-2">{formatYmdMonth(row.effective_from)}</td>
									<td className="py-2 font-mono">{fmt(row.monthly_amount_cents)}</td>
									<td className="py-2 text-muted-foreground">{row.notes || "—"}</td>
									<td className="py-2 text-right">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => setConfirmId(row.id)}
											disabled={pending}
										>
											Remove
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<ConfirmDialog
				open={!!confirmId}
				onOpenChange={(open) => !open && setConfirmId(null)}
				title="Remove this schedule entry?"
				description="The amount for this period will revert to whatever was in effect before. This affects historical reports."
				confirmLabel="Remove"
				destructive
				onConfirm={() => confirmId && remove(confirmId)}
			/>
		</section>
	);
}
