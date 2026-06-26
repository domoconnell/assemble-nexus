"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Textarea } from "@/shadcn/components/ui/textarea";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/shadcn/components/ui/dialog";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectGroup,
	SelectLabel,
	SelectItem,
} from "@/shadcn/components/ui/select";
import { categoriseTransactionAction } from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtMinor = (m) => gbp.format((m ?? 0) / 100);

/**
 * Unified categoriser. The target dropdown shows two flavours:
 *
 *   - "One-off" — variable expense categories (Supplies, Cleaning, …).
 *     Picking one creates an `expense` row (kind = spend|refund).
 *
 *   - "Recurring" — items inside a recurring cost type (utilities →
 *     Electric, etc.). Picking one just links the bank transaction to
 *     the recurring item; no expense row is created because the
 *     recurring schedule is the canonical record of that monthly spend.
 *
 * Values in the select use a prefix so we can tell the two cases apart
 * on submit: `expense:<id>` vs `recurring:<id>`.
 */
export default function CategoriseDialog({
	open,
	onOpenChange,
	kind, // "spend" | "refund"
	transaction,
	categories,
	recurringGroups,
}) {
	const router = useRouter();
	const [target, setTarget] = useState("");
	const [description, setDescription] = useState(
		transaction?.counterparty_name?.trim() ||
			transaction?.reference?.trim() ||
			"",
	);
	const [supplier, setSupplier] = useState(transaction?.counterparty_name?.trim() ?? "");
	const [notes, setNotes] = useState("");
	const [vatPounds, setVatPounds] = useState("");
	const [busy, setBusy] = useState(false);

	const isRefund = kind === "refund";
	const titleLabel = isRefund ? "Mark as refund" : "Categorise spending";
	const submitLabel = isRefund ? "Save refund" : "Save expense";

	// Parse the encoded value so we know which branch we're in.
	const [targetType, targetId] = target ? target.split(":") : [null, null];
	const isRecurringPick = targetType === "recurring";

	async function save() {
		if (!target) {
			toast.error("Pick a category or item.");
			return;
		}
		if (!description.trim() && !isRecurringPick) {
			toast.error("Add a short description.");
			return;
		}
		setBusy(true);
		try {
			const vatCents = vatPounds ? Math.round(Number(vatPounds) * 100) : 0;
			await categoriseTransactionAction({
				transaction_id: transaction.id,
				kind,
				expense_category_id: targetType === "expense" ? targetId : null,
				recurring_cost_item_id: targetType === "recurring" ? targetId : null,
				description: description.trim() || "(linked to recurring item)",
				supplier_name: supplier.trim() || null,
				notes: notes.trim() || null,
				vat_cents: vatCents,
			});
			toast.success(isRefund ? "Marked as refund" : "Categorised");
			onOpenChange(false);
			router.refresh();
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
					<DialogTitle>{titleLabel}</DialogTitle>
					<DialogDescription>
						{isRefund
							? `Pick what this refund offsets — either a one-off expense category or a recurring item.`
							: `Pick where this expense belongs. One-off categories create an entry in the Expenses list. Recurring items link the transaction to the recurring cost schedule.`}
					</DialogDescription>
				</DialogHeader>

				<dl className="grid gap-2 text-sm rounded-md border border-foreground/10 bg-muted/30 p-3">
					<div className="flex items-baseline justify-between gap-3 min-w-0">
						<dt className="text-muted-foreground shrink-0">Amount</dt>
						<dd className="font-mono">{fmtMinor(transaction?.amount_minor)}</dd>
					</div>
					<div className="flex items-baseline justify-between gap-3 min-w-0">
						<dt className="text-muted-foreground shrink-0">Counterparty</dt>
						<dd className="font-medium truncate min-w-0 text-right">
							{transaction?.counterparty_name || "—"}
						</dd>
					</div>
					{transaction?.reference && (
						<div className="flex items-baseline justify-between gap-3 min-w-0">
							<dt className="text-muted-foreground shrink-0">Reference</dt>
							<dd className="font-mono text-xs truncate min-w-0 text-right">
								{transaction.reference}
							</dd>
						</div>
					)}
				</dl>

				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label>Where does this belong?</Label>
						<Select value={target} onValueChange={setTarget}>
							<SelectTrigger>
								<SelectValue placeholder="Pick a category or recurring item" />
							</SelectTrigger>
							{/*
							 * Force a small absolute max-height (!important) so this
							 * beats Radix's auto-sizing to the available viewport
							 * space. On a tall display the popper otherwise grows
							 * to the bottom of the screen and the down-chevron sits
							 * outside the dialog where the user can't see it.
							 * Group labels get the tiny-uppercase treatment so
							 * they're clearly headers and items get an extra pl-6
							 * indent so the hierarchy reads at a glance.
							 */}
							<SelectContent className="max-h-72!">
								<SelectGroup>
									<SelectLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
										One-off
									</SelectLabel>
									{categories.map((c) => (
										<SelectItem
											key={c.id}
											value={`expense:${c.id}`}
											className="pl-6"
										>
											{c.name}
										</SelectItem>
									))}
								</SelectGroup>
								{recurringGroups.map((g) => (
									<SelectGroup key={g.type}>
										<SelectLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
											{g.label}
										</SelectLabel>
										{g.items.map((it) => (
											<SelectItem
												key={it.id}
												value={`recurring:${it.id}`}
												className="pl-6"
											>
												{it.label}
											</SelectItem>
										))}
									</SelectGroup>
								))}
							</SelectContent>
						</Select>
					</div>

					{!isRecurringPick && (
						<>
							<div className="space-y-1.5">
								<Label htmlFor="cat-desc">Description</Label>
								<Input
									id="cat-desc"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="What was this for?"
								/>
							</div>
							{!isRefund && (
								<div className="space-y-1.5">
									<Label htmlFor="cat-supplier">Supplier (optional)</Label>
									<Input
										id="cat-supplier"
										value={supplier}
										onChange={(e) => setSupplier(e.target.value)}
										placeholder="Who did the money go to?"
									/>
								</div>
							)}
							<div className="space-y-1.5">
								<Label htmlFor="cat-vat">
									VAT (£, optional){" "}
									<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
										portion of the amount
									</span>
								</Label>
								<Input
									id="cat-vat"
									type="number"
									step="0.01"
									min="0"
									value={vatPounds}
									onChange={(e) => setVatPounds(e.target.value)}
									placeholder="0.00"
								/>
							</div>
						</>
					)}

					<div className="space-y-1.5">
						<Label htmlFor="cat-notes">Notes (optional)</Label>
						<Textarea
							id="cat-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={2}
						/>
					</div>
				</div>

				<div className="flex justify-end gap-2 pt-2 border-t border-foreground/10">
					<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
						Cancel
					</Button>
					<Button
						onClick={save}
						disabled={
							busy || !target || (!isRecurringPick && !description.trim())
						}
					>
						{busy ? "Saving…" : submitLabel}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
