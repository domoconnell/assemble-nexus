"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Textarea } from "@/shadcn/components/ui/textarea";
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
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import { saveManualIncomeAction, deleteManualIncomeAction } from "./actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const dayFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	timeZone: "UTC",
});
function formatDate(ymd) {
	if (!ymd) return "-";
	const [y, m, d] = ymd.split("-").map(Number);
	return dayFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

const KIND_OPTIONS = [
	{ value: "donation", label: "Donation" },
	{ value: "equipment_hire", label: "Equipment hire" },
	{ value: "other", label: "Other" },
];

function kindLabel(kind) {
	return KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

function todayYmd() {
	const now = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function emptyDraft() {
	return {
		id: null,
		date: todayYmd(),
		kind: "donation",
		description: "",
		amount_pounds: "",
		vat_pounds: "",
		notes: "",
	};
}

export default function ManualIncomeClient({ ym, monthLabel, items }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [editing, setEditing] = useState(null);
	const [confirmId, setConfirmId] = useState(null);

	const total = useMemo(
		() => items.reduce((s, i) => s + (i.amount_cents ?? 0), 0),
		[items],
	);

	function openNew() {
		setEditing(emptyDraft());
	}
	function openEdit(row) {
		setEditing({
			id: row.id,
			date: row.date,
			kind: row.kind,
			description: row.description,
			amount_pounds: ((row.amount_cents ?? 0) / 100).toFixed(2),
			vat_pounds: ((row.vat_cents ?? 0) / 100).toFixed(2),
			notes: row.notes ?? "",
		});
	}

	function save(e) {
		e?.preventDefault();
		if (!editing) return;
		startTransition(async () => {
			try {
				await saveManualIncomeAction({
					id: editing.id,
					date: editing.date,
					kind: editing.kind,
					description: editing.description,
					amount_pounds: Number(editing.amount_pounds || 0),
					vat_pounds: Number(editing.vat_pounds || 0),
					notes: editing.notes || null,
				});
				toast.success(editing.id ? "Income updated" : "Income added");
				setEditing(null);
			} catch (err) {
				toast.error(err?.message || "Couldn't save");
			}
		});
	}

	function remove(id) {
		startTransition(async () => {
			try {
				await deleteManualIncomeAction(id);
				toast.success("Removed");
			} catch (err) {
				toast.error(err?.message || "Couldn't remove");
			}
			setConfirmId(null);
		});
	}

	function gotoMonth(value) {
		router.replace(`/admin/ledger/income?month=${value}`);
	}

	return (
		<>
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div className="flex items-baseline gap-3 flex-wrap">
					<Input
						type="month"
						value={ym}
						onChange={(e) => gotoMonth(e.target.value)}
						className="w-44"
					/>
					<span className="text-sm text-muted-foreground">
						{items.length} {items.length === 1 ? "entry" : "entries"} ·{" "}
						<span className="font-mono">{fmt(total)}</span>
					</span>
				</div>
				<Button onClick={openNew}>Add income</Button>
			</div>

			{items.length === 0 ? (
				<div className="rounded-lg border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
					No manual income recorded for {monthLabel}.
				</div>
			) : (
				<div className="rounded-lg border bg-card overflow-x-auto">
					<table className="w-full text-sm">
						<thead className="bg-muted/40">
							<tr className="text-left">
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">Date</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">Kind</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">Description</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground text-right">Amount</th>
								<th className="px-2 py-2" />
							</tr>
						</thead>
						<tbody>
							{items.map((row) => (
								<tr key={row.id} className="border-t border-foreground/5">
									<td className="px-4 py-2 whitespace-nowrap">{formatDate(row.date)}</td>
									<td className="px-4 py-2 text-muted-foreground">{kindLabel(row.kind)}</td>
									<td className="px-4 py-2">{row.description}</td>
									<td className="px-4 py-2 text-right font-mono whitespace-nowrap">{fmt(row.amount_cents)}</td>
									<td className="px-2 py-2 whitespace-nowrap text-right">
										<Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
											Edit
										</Button>
										<Button
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

			<Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
				<DialogContent className="p-6 sm:p-8 space-y-5 max-w-lg">
					<DialogHeader>
						<DialogTitle>{editing?.id ? "Edit income" : "Add income"}</DialogTitle>
						<DialogDescription>
							Donations, equipment hire, and other ad-hoc receipts.
						</DialogDescription>
					</DialogHeader>
					{editing && (
						<form onSubmit={save} className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label htmlFor="inc-date">Date</Label>
									<Input
										id="inc-date"
										type="date"
										value={editing.date}
										onChange={(e) => setEditing({ ...editing, date: e.target.value })}
										required
									/>
								</div>
								<div className="space-y-1.5">
									<Label>Kind</Label>
									<Select
										value={editing.kind}
										onValueChange={(v) => setEditing({ ...editing, kind: v })}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{KIND_OPTIONS.map((o) => (
												<SelectItem key={o.value} value={o.value}>
													{o.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="inc-desc">Description</Label>
								<Input
									id="inc-desc"
									value={editing.description}
									onChange={(e) =>
										setEditing({ ...editing, description: e.target.value })
									}
									placeholder="Who and what for"
									required
								/>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label htmlFor="inc-amount">Amount (£, gross)</Label>
									<Input
										id="inc-amount"
										type="number"
										inputMode="decimal"
										min="0"
										step="0.01"
										value={editing.amount_pounds}
										onChange={(e) =>
											setEditing({ ...editing, amount_pounds: e.target.value })
										}
										required
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="inc-vat">
										VAT (£, optional)
										<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground ml-1">
											portion of the gross
										</span>
									</Label>
									<Input
										id="inc-vat"
										type="number"
										inputMode="decimal"
										min="0"
										step="0.01"
										value={editing.vat_pounds}
										onChange={(e) =>
											setEditing({ ...editing, vat_pounds: e.target.value })
										}
									/>
								</div>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="inc-notes">Notes (optional)</Label>
								<Textarea
									id="inc-notes"
									value={editing.notes}
									onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
									rows={3}
								/>
							</div>
							<div className="flex justify-end gap-2 pt-2">
								<Button type="button" variant="ghost" onClick={() => setEditing(null)}>
									Cancel
								</Button>
								<Button type="submit" disabled={pending}>
									{pending ? "Saving…" : editing.id ? "Save changes" : "Add income"}
								</Button>
							</div>
						</form>
					)}
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={!!confirmId}
				onOpenChange={(open) => !open && setConfirmId(null)}
				title="Remove this income entry?"
				description="It will be soft-deleted and won't appear in reports."
				confirmLabel="Remove"
				destructive
				onConfirm={() => confirmId && remove(confirmId)}
			/>
		</>
	);
}
