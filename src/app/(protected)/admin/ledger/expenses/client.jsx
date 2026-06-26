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
import { saveExpenseAction, deleteExpenseAction } from "./actions";

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

const NO_CATEGORY = "__none__";
const NO_EVENT = "__none__";

const eventDateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});
function formatEventLabel(ev) {
	if (!ev) return "";
	const when = ev.starts_at ? ` - ${eventDateFmt.format(new Date(ev.starts_at))}` : "";
	return `${ev.title}${when}`;
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
		expense_category_id: "",
		description: "",
		amount_pounds: "",
		vat_pounds: "",
		supplier_name: "",
		linked_event_id: "",
		notes: "",
	};
}

export default function ExpensesClient({ ym, monthLabel, categories, expenses, events = [] }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [editing, setEditing] = useState(null);
	const [confirmId, setConfirmId] = useState(null);

	// Net of refunds: a row with kind='refund' stores a positive amount
	// but represents money coming back in, so it offsets spend. Mirrors
	// the SQL CASE WHEN we apply to reporting aggregates.
	const total = useMemo(
		() =>
			expenses.reduce(
				(s, e) => s + (e.kind === "refund" ? -1 : 1) * (e.amount_cents ?? 0),
				0,
			),
		[expenses],
	);

	function openNew() {
		setEditing(emptyDraft());
	}
	function openEdit(row) {
		setEditing({
			id: row.id,
			date: row.date,
			expense_category_id: row.expense_category_id ?? "",
			description: row.description ?? "",
			amount_pounds: ((row.amount_cents ?? 0) / 100).toFixed(2),
			vat_pounds: ((row.vat_cents ?? 0) / 100).toFixed(2),
			supplier_name: row.supplier_name ?? "",
			linked_event_id: row.linked_event_id ?? "",
			notes: row.notes ?? "",
		});
	}

	const eventsById = useMemo(
		() => new Map(events.map((e) => [e.id, e])),
		[events],
	);

	function save(e) {
		e?.preventDefault();
		if (!editing) return;
		startTransition(async () => {
			try {
				await saveExpenseAction({
					id: editing.id,
					date: editing.date,
					expense_category_id: editing.expense_category_id || null,
					description: editing.description,
					amount_pounds: Number(editing.amount_pounds || 0),
					vat_pounds: Number(editing.vat_pounds || 0),
					supplier_name: editing.supplier_name || null,
					linked_event_id: editing.linked_event_id || null,
					notes: editing.notes || null,
				});
				toast.success(editing.id ? "Expense updated" : "Expense added");
				setEditing(null);
			} catch (err) {
				toast.error(err?.message || "Couldn't save");
			}
		});
	}

	function remove(id) {
		startTransition(async () => {
			try {
				await deleteExpenseAction(id);
				toast.success("Removed");
			} catch (err) {
				toast.error(err?.message || "Couldn't remove");
			}
			setConfirmId(null);
		});
	}

	function gotoMonth(value) {
		router.replace(`/admin/ledger/expenses?month=${value}`);
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
						{expenses.length} {expenses.length === 1 ? "expense" : "expenses"} ·{" "}
						<span className="font-mono">{fmt(total)}</span>
					</span>
				</div>
				<Button onClick={openNew}>Add expense</Button>
			</div>

			{expenses.length === 0 ? (
				<div className="rounded-lg border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
					No expenses recorded for {monthLabel}.
				</div>
			) : (
				<div className="rounded-lg border bg-card overflow-x-auto">
					<table className="w-full text-sm">
						<thead className="bg-muted/40">
							<tr className="text-left">
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">Date</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">Description</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">Category</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">Supplier</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground text-right">Amount</th>
								<th className="px-2 py-2" />
							</tr>
						</thead>
						<tbody>
							{expenses.map((row) => {
								const linkedEvent = row.linked_event_id ? eventsById.get(row.linked_event_id) : null;
								const isRefund = row.kind === "refund";
								return (
									<tr key={row.id} className="border-t border-foreground/5">
										<td className="px-4 py-2 whitespace-nowrap">{formatDate(row.date)}</td>
										<td className="px-4 py-2">
											<div className="flex items-baseline gap-2 flex-wrap">
												<span>{row.description}</span>
												{isRefund && (
													<span className="text-[10px] uppercase tracking-[0.18em] rounded-full border border-primary/30 bg-primary/10 text-primary px-2 py-0.5">
														Refund
													</span>
												)}
											</div>
											{linkedEvent && (
												<div className="text-xs text-muted-foreground">
													Event: {linkedEvent.title}
												</div>
											)}
										</td>
										<td className="px-4 py-2 text-muted-foreground">{row.category_name ?? "-"}</td>
										<td className="px-4 py-2 text-muted-foreground">{row.supplier_name ?? "-"}</td>
										<td className={`px-4 py-2 text-right font-mono whitespace-nowrap ${isRefund ? "text-primary" : ""}`}>
											{isRefund ? `-${fmt(row.amount_cents)}` : fmt(row.amount_cents)}
										</td>
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
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			<Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
				<DialogContent className="p-6 sm:p-8 space-y-5 max-w-lg">
					<DialogHeader>
						<DialogTitle>{editing?.id ? "Edit expense" : "Add expense"}</DialogTitle>
						<DialogDescription>
							Operational costs feed into "cost of delivery" in the monthly P&amp;L.
						</DialogDescription>
					</DialogHeader>
					{editing && (
						<form onSubmit={save} className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-3">
								<div className="space-y-1.5">
									<Label htmlFor="exp-date">Date</Label>
									<Input
										id="exp-date"
										type="date"
										value={editing.date}
										onChange={(e) => setEditing({ ...editing, date: e.target.value })}
										required
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="exp-amount">Amount (£)</Label>
									<Input
										id="exp-amount"
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
									<p className="text-[11px] text-muted-foreground">Total inc. VAT</p>
								</div>
								<div className="space-y-1.5">
									<div className="flex items-baseline justify-between gap-2">
										<Label htmlFor="exp-vat">VAT (£)</Label>
										<button
											type="button"
											onClick={() => {
												const total = Number(editing.amount_pounds || 0);
												const vat = total - total / 1.2;
												setEditing({ ...editing, vat_pounds: vat.toFixed(2) });
											}}
											className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition"
										>
											20% of total
										</button>
									</div>
									<Input
										id="exp-vat"
										type="number"
										inputMode="decimal"
										min="0"
										step="0.01"
										value={editing.vat_pounds}
										onChange={(e) =>
											setEditing({ ...editing, vat_pounds: e.target.value })
										}
									/>
									<p className="text-[11px] text-muted-foreground">0 if supplier isn&apos;t VAT-reg.</p>
								</div>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="exp-desc">Description</Label>
								<Input
									id="exp-desc"
									value={editing.description}
									onChange={(e) =>
										setEditing({ ...editing, description: e.target.value })
									}
									placeholder="What was this for?"
									required
								/>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label>Category</Label>
									<Select
										value={editing.expense_category_id || NO_CATEGORY}
										onValueChange={(v) =>
											setEditing({
												...editing,
												expense_category_id: v === NO_CATEGORY ? "" : v,
											})
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="None" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NO_CATEGORY}>None</SelectItem>
											{categories.map((c) => (
												<SelectItem key={c.id} value={c.id}>
													{c.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="exp-supplier">Supplier (optional)</Label>
									<Input
										id="exp-supplier"
										value={editing.supplier_name}
										onChange={(e) =>
											setEditing({ ...editing, supplier_name: e.target.value })
										}
									/>
								</div>
							</div>
							<div className="space-y-1.5">
								<Label>Linked event (optional)</Label>
								<Select
									value={editing.linked_event_id || NO_EVENT}
									onValueChange={(v) =>
										setEditing({
											...editing,
											linked_event_id: v === NO_EVENT ? "" : v,
										})
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="None" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_EVENT}>None</SelectItem>
										{events.map((ev) => (
											<SelectItem key={ev.id} value={ev.id}>
												{formatEventLabel(ev)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									Linking lets the event's Overview tab show this cost in its net-profit calculation.
								</p>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="exp-notes">Notes (optional)</Label>
								<Textarea
									id="exp-notes"
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
									{pending ? "Saving…" : editing.id ? "Save changes" : "Add expense"}
								</Button>
							</div>
						</form>
					)}
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={!!confirmId}
				onOpenChange={(open) => !open && setConfirmId(null)}
				title="Remove this expense?"
				description="It will be soft-deleted and won't appear in reports."
				confirmLabel="Remove"
				destructive
				onConfirm={() => confirmId && remove(confirmId)}
			/>
		</>
	);
}
