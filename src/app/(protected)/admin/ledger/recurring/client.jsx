"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import {
	createRecurringCostItemAction,
	renameRecurringCostItemAction,
	deleteRecurringCostItemAction,
	addScheduleEntryAction,
	deleteScheduleEntryAction,
} from "./actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const monthFmt = new Intl.DateTimeFormat("en-GB", {
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});

function formatYmdMonth(ymd) {
	if (!ymd) return "-";
	const [y, m] = ymd.split("-").map(Number);
	return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

function currentYm() {
	const now = new Date();
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentAmount(history) {
	return history[0]?.monthly_amount_cents ?? 0;
}

/**
 * Render the scheduled monthly cost next to what we've actually paid
 * out (sum of bank transactions linked to this recurring item this
 * month). Two visual modes:
 *
 *   - `big`: type-section header. Larger scheduled total, actual underneath.
 *   - default: per-item row. Compact stacked layout matching the
 *              previous single-figure look.
 *
 * Variance only shows once there's at least one bank transaction —
 * showing "-£120.00 (this month)" against zero actuals would mislead.
 * Positive variance = saved against schedule (green); negative = over
 * (amber). Zero shows the neutral "on schedule" line.
 */
function ScheduledVsActual({ scheduledCents, actualCents, big = false }) {
	const variance = (scheduledCents ?? 0) - (actualCents ?? 0);
	const hasActual = (actualCents ?? 0) !== 0;
	let varianceLabel = "";
	let varianceTone = "text-muted-foreground";
	if (hasActual) {
		if (variance > 0) {
			varianceLabel = `${fmt(variance)} under`;
			varianceTone = "text-primary";
		} else if (variance < 0) {
			varianceLabel = `${fmt(Math.abs(variance))} over`;
			varianceTone = "text-amber-600 dark:text-amber-400";
		} else {
			varianceLabel = "on schedule";
		}
	}
	return (
		<div className={`text-right ${big ? "" : "shrink-0"}`}>
			<div className={`font-mono tabular-nums ${big ? "font-display text-xl" : ""}`}>
				{fmt(scheduledCents)}
			</div>
			<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
				scheduled
			</div>
			<div className={`font-mono tabular-nums mt-1 ${big ? "text-sm" : "text-xs"}`}>
				{hasActual ? fmt(actualCents) : "—"}
			</div>
			<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
				actual this month
			</div>
			{varianceLabel && (
				<div className={`text-[10px] mt-0.5 ${varianceTone}`}>{varianceLabel}</div>
			)}
		</div>
	);
}

export default function RecurringCostsClient({ sections }) {
	return (
		<div className="space-y-8">
			{sections.map((section) => (
				<TypeSection key={section.type} section={section} />
			))}
		</div>
	);
}

function TypeSection({ section }) {
	const [showAddItem, setShowAddItem] = useState(false);
	return (
		<section className="rounded-lg border bg-card p-6 space-y-5">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div>
					<h2 className="text-sm font-semibold">{section.label}</h2>
					<p className="text-xs text-muted-foreground mt-1 max-w-prose">
						{section.description}
					</p>
				</div>
				<ScheduledVsActual
					scheduledCents={section.current_total}
					actualCents={section.actual_total}
					big
				/>
			</div>

			{section.items.length === 0 ? (
				<p className="text-sm text-muted-foreground border border-dashed rounded-md p-4">
					No line items yet. Add one to start tracking this category.
				</p>
			) : (
				<ul className="space-y-2">
					{section.items.map((item) => (
						<ItemRow key={item.id} item={item} type={section.type} />
					))}
				</ul>
			)}

			{showAddItem ? (
				<AddItemForm type={section.type} onDone={() => setShowAddItem(false)} />
			) : (
				<Button type="button" variant="outline" size="sm" onClick={() => setShowAddItem(true)}>
					+ Add line item
				</Button>
			)}
		</section>
	);
}

function ItemRow({ item, type }) {
	const router = useRouter();
	const [editingLabel, setEditingLabel] = useState(false);
	const [label, setLabel] = useState(item.label);
	const [showHistory, setShowHistory] = useState(false);
	const [showAddSchedule, setShowAddSchedule] = useState(false);
	const [pending, startTransition] = useTransition();
	const [confirmDelete, setConfirmDelete] = useState(false);

	const current = currentAmount(item.history);

	function saveLabel() {
		startTransition(async () => {
			try {
				await renameRecurringCostItemAction({ id: item.id, label });
				setEditingLabel(false);
				toast.success("Saved");
				router.refresh();
			} catch (err) {
				toast.error(err?.message || "Couldn't rename.");
			}
		});
	}

	function deleteItem() {
		startTransition(async () => {
			try {
				await deleteRecurringCostItemAction(item.id);
				toast.success("Removed");
				router.refresh();
			} catch (err) {
				toast.error(err?.message || "Couldn't delete.");
			}
		});
	}

	return (
		<li className="rounded-md border border-foreground/10 bg-background overflow-hidden">
			<div className="flex items-baseline justify-between gap-3 px-4 py-3">
				<div className="min-w-0 flex-1">
					{editingLabel ? (
						<div className="flex items-center gap-2">
							<Input
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								className="h-8 max-w-xs"
								maxLength={120}
							/>
							<Button size="sm" onClick={saveLabel} disabled={pending}>
								Save
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									setLabel(item.label);
									setEditingLabel(false);
								}}
							>
								Cancel
							</Button>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setEditingLabel(true)}
							className="text-sm font-medium hover:text-primary"
							title="Click to rename"
						>
							{item.label}
						</button>
					)}
					<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
						{item.history.length} entr{item.history.length === 1 ? "y" : "ies"} in history
					</div>
				</div>
				<div className="text-right shrink-0 space-y-1">
					<ScheduledVsActual
						scheduledCents={current}
						actualCents={item.actual_cents ?? 0}
					/>
					<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						scheduled from {formatYmdMonth(item.history[0]?.effective_from)}
					</div>
				</div>
			</div>

			<div className="flex items-center gap-2 px-4 pb-3 text-xs">
				<button
					type="button"
					onClick={() => setShowHistory(!showHistory)}
					className="text-muted-foreground hover:text-foreground"
				>
					{showHistory ? "Hide" : "Show"} history
				</button>
				<span className="text-muted-foreground/40">·</span>
				<button
					type="button"
					onClick={() => setShowAddSchedule(!showAddSchedule)}
					className="text-muted-foreground hover:text-foreground"
				>
					New amount from a future date
				</button>
				<span className="text-muted-foreground/40">·</span>
				<button
					type="button"
					onClick={() => setConfirmDelete(true)}
					className="text-destructive/80 hover:text-destructive"
				>
					Remove item
				</button>
			</div>

			{showHistory && (
				<div className="border-t border-foreground/10 bg-muted/30 px-4 py-3 space-y-1.5">
					{item.history.length === 0 ? (
						<p className="text-xs text-muted-foreground">No history yet.</p>
					) : (
						item.history.map((row, idx) => (
							<HistoryRow
								key={row.id}
								row={row}
								isCurrent={idx === 0}
								onDelete={() => {
									startTransition(async () => {
										try {
											await deleteScheduleEntryAction(row.id);
											toast.success("Removed");
											router.refresh();
										} catch (err) {
											toast.error(err?.message || "Couldn't remove.");
										}
									});
								}}
							/>
						))
					)}
				</div>
			)}

			{showAddSchedule && (
				<div className="border-t border-foreground/10 bg-muted/30 px-4 py-4">
					<AddScheduleForm itemId={item.id} type={type} onDone={() => setShowAddSchedule(false)} />
				</div>
			)}

			<ConfirmDialog
				open={confirmDelete}
				onOpenChange={setConfirmDelete}
				title={`Remove ${item.label}?`}
				description="Soft-deletes the line item so it stops counting toward the total. History rows stay on file."
				confirmLabel="Remove"
				destructive
				onConfirm={deleteItem}
			/>
		</li>
	);
}

function HistoryRow({ row, isCurrent, onDelete }) {
	const [pending, startTransition] = useTransition();
	return (
		<div className="flex items-baseline justify-between gap-3 text-xs">
			<div>
				<span className="font-mono tabular-nums">{fmt(row.monthly_amount_cents)}</span>
				<span className="text-muted-foreground ml-2">
					from {formatYmdMonth(row.effective_from)}
				</span>
				{isCurrent && (
					<span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-primary">
						current
					</span>
				)}
			</div>
			<button
				type="button"
				onClick={() => startTransition(onDelete)}
				disabled={pending}
				className="text-muted-foreground hover:text-destructive"
			>
				delete
			</button>
		</div>
	);
}

function AddItemForm({ type, onDone }) {
	const router = useRouter();
	const [label, setLabel] = useState("");
	const [amount, setAmount] = useState("");
	const [effectiveFromYm, setEffectiveFromYm] = useState(currentYm());
	const [pending, startTransition] = useTransition();

	function submit(e) {
		e.preventDefault();
		startTransition(async () => {
			try {
				await createRecurringCostItemAction({
					type,
					label,
					initial_amount_pounds: Number(amount || 0),
					initial_effective_from_ym: effectiveFromYm,
				});
				toast.success("Added");
				router.refresh();
				onDone();
			} catch (err) {
				toast.error(err?.message || "Couldn't add.");
			}
		});
	}

	return (
		<form onSubmit={submit} className="rounded-md border bg-background p-4 space-y-3">
			<div className="grid gap-3 sm:grid-cols-3">
				<div className="space-y-2 sm:col-span-2">
					<Label htmlFor={`label-${type}`}>Name</Label>
					<Input
						id={`label-${type}`}
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						placeholder="e.g. Electric"
						required
						maxLength={120}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`amount-${type}`}>Amount (£)</Label>
					<Input
						id={`amount-${type}`}
						type="number"
						min={0}
						step="0.01"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						required
					/>
				</div>
			</div>
			<div className="grid gap-3 sm:grid-cols-3 items-end">
				<div className="space-y-2 sm:col-span-2">
					<Label htmlFor={`from-${type}`}>Effective from (month)</Label>
					<Input
						id={`from-${type}`}
						type="month"
						value={effectiveFromYm}
						onChange={(e) => setEffectiveFromYm(e.target.value)}
						required
					/>
				</div>
				<div className="flex justify-end gap-2">
					<Button type="button" variant="ghost" size="sm" onClick={onDone}>
						Cancel
					</Button>
					<Button type="submit" size="sm" disabled={pending || !label.trim()}>
						{pending ? "Saving…" : "Add"}
					</Button>
				</div>
			</div>
		</form>
	);
}

function AddScheduleForm({ itemId, type, onDone }) {
	const router = useRouter();
	const [amount, setAmount] = useState("");
	const [effectiveFromYm, setEffectiveFromYm] = useState(currentYm());
	const [notes, setNotes] = useState("");
	const [pending, startTransition] = useTransition();

	function submit(e) {
		e.preventDefault();
		startTransition(async () => {
			try {
				await addScheduleEntryAction({
					item_id: itemId,
					type,
					effective_from_ym: effectiveFromYm,
					amount_pounds: Number(amount || 0),
					notes: notes || null,
				});
				toast.success("Saved");
				router.refresh();
				onDone();
			} catch (err) {
				toast.error(err?.message || "Couldn't save.");
			}
		});
	}

	return (
		<form onSubmit={submit} className="space-y-3">
			<div className="grid gap-3 sm:grid-cols-3 items-end">
				<div className="space-y-2">
					<Label htmlFor={`new-amount-${itemId}`}>New amount (£)</Label>
					<Input
						id={`new-amount-${itemId}`}
						type="number"
						min={0}
						step="0.01"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						required
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`new-from-${itemId}`}>Effective from</Label>
					<Input
						id={`new-from-${itemId}`}
						type="month"
						value={effectiveFromYm}
						onChange={(e) => setEffectiveFromYm(e.target.value)}
						required
					/>
				</div>
				<div className="flex justify-end gap-2">
					<Button type="button" variant="ghost" size="sm" onClick={onDone}>
						Cancel
					</Button>
					<Button type="submit" size="sm" disabled={pending}>
						{pending ? "Saving…" : "Apply"}
					</Button>
				</div>
			</div>
			<div className="space-y-2">
				<Label htmlFor={`new-notes-${itemId}`} className="text-xs text-muted-foreground">
					Notes (optional)
				</Label>
				<Input
					id={`new-notes-${itemId}`}
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					placeholder="e.g. price rise after winter contract"
					maxLength={500}
				/>
			</div>
		</form>
	);
}
