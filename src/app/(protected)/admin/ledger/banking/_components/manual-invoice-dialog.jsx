"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
	upsertManualInvoiceAction,
	getManualInvoiceForEditAction,
	deleteManualInvoiceAction,
} from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtMinor = (m) => gbp.format((m ?? 0) / 100);

function emptyLine(amount = "") {
	return {
		key: Math.random().toString(36).slice(2, 10),
		description: "",
		amount: amount,
	};
}

/**
 * Create-or-edit manual invoice dialog. Three modes, gated by props:
 *
 *   - `mode="create"`  : create against a bank transaction. Lines must
 *                        sum to >= transaction amount; the action auto-
 *                        derives a discount to bring the total down to
 *                        the bank amount.
 *   - `mode="edit"`    : load + edit an existing invoice. Fetches its
 *                        lines via the server action when opened.
 *   - `mode="manual"`  : (future) create a standalone invoice not tied
 *                        to a bank transaction. Skips the discount math.
 *
 * `organisations` is the venue's CRM org list — the dropdown lets the
 * admin pick one or "Customer details (no organisation)" to fill in
 * ad-hoc fields.
 */
export default function ManualInvoiceDialog({
	open,
	onOpenChange,
	mode = "create",
	bankTransaction = null, // create mode: the row we're invoicing for
	invoiceId = null, // edit mode: the invoice to load
	organisations = [],
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(mode === "edit");
	const [reference, setReference] = useState(null); // populated in edit mode
	const [organisationId, setOrganisationId] = useState("");
	const [customerName, setCustomerName] = useState("");
	const [customerEmail, setCustomerEmail] = useState("");
	const [customerAddress, setCustomerAddress] = useState("");
	const [customerVat, setCustomerVat] = useState("");
	const [description, setDescription] = useState("");
	const [notes, setNotes] = useState("");
	const [lines, setLines] = useState(() => [emptyLine()]);

	// Load existing invoice when editing.
	useEffect(() => {
		if (mode !== "edit" || !invoiceId) return;
		let cancelled = false;
		(async () => {
			try {
				const data = await getManualInvoiceForEditAction({ invoice_id: invoiceId });
				if (cancelled || !data) return;
				const inv = data.invoice;
				setReference(inv.reference);
				setOrganisationId(inv.organisation_id ?? "");
				setCustomerName(inv.customer_name ?? "");
				setCustomerEmail(inv.customer_email ?? "");
				setCustomerAddress(
					Array.isArray(inv.customer_address_lines)
						? inv.customer_address_lines.join("\n")
						: "",
				);
				setCustomerVat(inv.customer_vat_number ?? "");
				setDescription(inv.description ?? "");
				setNotes(inv.notes ?? "");
				setLines(
					(data.lines ?? []).map((l) => ({
						key: l.id,
						description: l.description,
						amount: ((l.amount_cents ?? 0) / 100).toFixed(2),
					})),
				);
			} catch (err) {
				toast.error(err?.message || "Couldn't load invoice");
				onOpenChange(false);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [mode, invoiceId, onOpenChange]);

	// Pre-fill customer name from bank counterparty on first open in
	// create mode — saves a step for the common "raise invoice against
	// the org named on the bank transaction" flow.
	useEffect(() => {
		if (mode === "create" && open && !customerName && bankTransaction?.counterparty_name) {
			setCustomerName(bankTransaction.counterparty_name);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, mode]);

	const subtotalCents = useMemo(
		() =>
			lines.reduce(
				(s, l) => s + Math.round(Number(l.amount || 0) * 100),
				0,
			),
		[lines],
	);
	const targetCents = bankTransaction?.amount_minor ?? 0;
	const discountCents =
		mode === "create" && subtotalCents > targetCents ? subtotalCents - targetCents : 0;
	const totalCents = subtotalCents - discountCents;
	const undershoot = mode === "create" && subtotalCents < targetCents;

	function updateLine(key, patch) {
		setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
	}
	function removeLine(key) {
		setLines((cur) => (cur.length === 1 ? cur : cur.filter((l) => l.key !== key)));
	}
	function addLine() {
		setLines((cur) => [...cur, emptyLine()]);
	}

	async function save() {
		if (!organisationId && !customerName.trim()) {
			toast.error("Pick an organisation or enter a customer name.");
			return;
		}
		if (lines.some((l) => !l.description.trim())) {
			toast.error("Each line needs a description.");
			return;
		}
		if (lines.some((l) => Number(l.amount || 0) <= 0)) {
			toast.error("Each line needs an amount above £0.");
			return;
		}
		if (undershoot) {
			toast.error(
				`Line items total ${fmtMinor(subtotalCents)}. Add another line so the invoice covers the full ${fmtMinor(targetCents)}.`,
			);
			return;
		}
		setBusy(true);
		try {
			await upsertManualInvoiceAction({
				invoice_id: mode === "edit" ? invoiceId : null,
				bank_transaction_id: mode === "create" ? bankTransaction?.id : null,
				organisation_id: organisationId || null,
				customer_name: customerName.trim() || null,
				customer_email: customerEmail.trim() || null,
				customer_address: customerAddress.trim() || null,
				customer_vat_number: customerVat.trim() || null,
				description: description.trim() || null,
				notes: notes.trim() || null,
				lines: lines.map((l) => ({
					description: l.description.trim(),
					amount_cents: Math.round(Number(l.amount || 0) * 100),
				})),
			});
			toast.success(mode === "edit" ? "Invoice updated" : "Invoice created");
			onOpenChange(false);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't save");
		} finally {
			setBusy(false);
		}
	}

	async function deleteInvoice() {
		if (mode !== "edit" || !invoiceId) return;
		if (!confirm("Delete this invoice? The bank transaction will go back to Unmatched.")) {
			return;
		}
		setBusy(true);
		try {
			await deleteManualInvoiceAction({ invoice_id: invoiceId });
			toast.success("Invoice deleted");
			onOpenChange(false);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't delete");
		} finally {
			setBusy(false);
		}
	}

	const title = mode === "edit" ? `Edit invoice ${reference ?? ""}` : "Create invoice";
	const submitLabel = mode === "edit" ? "Save changes" : "Create invoice";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="p-6 sm:p-8 space-y-5 max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Raise a one-off invoice against this bank transaction. The total will match the received amount — if your line items add up to more, the difference shows as a discount on the PDF."
							: "Update the line items, customer details or notes on this invoice."}
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
				) : (
					<>
						{mode === "create" && bankTransaction && (
							<dl className="grid gap-2 text-sm rounded-md border border-foreground/10 bg-muted/30 p-3">
								<div className="flex items-baseline justify-between gap-3 min-w-0">
									<dt className="text-muted-foreground shrink-0">Received</dt>
									<dd className="font-mono">{fmtMinor(targetCents)}</dd>
								</div>
								<div className="flex items-baseline justify-between gap-3 min-w-0">
									<dt className="text-muted-foreground shrink-0">From</dt>
									<dd className="font-medium truncate min-w-0 text-right">
										{bankTransaction.counterparty_name || "—"}
									</dd>
								</div>
							</dl>
						)}

						<div className="space-y-4">
							{/* Billed-to */}
							<div className="space-y-1.5">
								<Label>Billed to</Label>
								<Select value={organisationId || "_none"} onValueChange={(v) => setOrganisationId(v === "_none" ? "" : v)}>
									<SelectTrigger>
										<SelectValue placeholder="Pick an organisation" />
									</SelectTrigger>
									<SelectContent className="max-h-72!">
										<SelectGroup>
											<SelectLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
												From the CRM
											</SelectLabel>
											{organisations.map((o) => (
												<SelectItem key={o.id} value={o.id} className="pl-6">
													{o.name}
												</SelectItem>
											))}
										</SelectGroup>
										<SelectGroup>
											<SelectLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
												Or
											</SelectLabel>
											<SelectItem value="_none" className="pl-6">
												Customer details (no organisation)
											</SelectItem>
										</SelectGroup>
									</SelectContent>
								</Select>
							</div>

							{!organisationId && (
								<div className="grid gap-3 sm:grid-cols-2 rounded-md border border-dashed border-foreground/15 p-3">
									<div className="space-y-1.5 sm:col-span-2">
										<Label htmlFor="cust-name">Customer name</Label>
										<Input
											id="cust-name"
											value={customerName}
											onChange={(e) => setCustomerName(e.target.value)}
											placeholder="Person or company name"
										/>
									</div>
									<div className="space-y-1.5">
										<Label htmlFor="cust-email">Email (optional)</Label>
										<Input
											id="cust-email"
											type="email"
											value={customerEmail}
											onChange={(e) => setCustomerEmail(e.target.value)}
										/>
									</div>
									<div className="space-y-1.5">
										<Label htmlFor="cust-vat">VAT number (optional)</Label>
										<Input
											id="cust-vat"
											value={customerVat}
											onChange={(e) => setCustomerVat(e.target.value)}
										/>
									</div>
									<div className="space-y-1.5 sm:col-span-2">
										<Label htmlFor="cust-address">Address (optional, one line each)</Label>
										<Textarea
											id="cust-address"
											value={customerAddress}
											onChange={(e) => setCustomerAddress(e.target.value)}
											rows={3}
											placeholder={`Street\nCity\nPostcode`}
										/>
									</div>
								</div>
							)}

							{/* Description */}
							<div className="space-y-1.5">
								<Label htmlFor="inv-desc">What's this invoice for? (optional)</Label>
								<Input
									id="inv-desc"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="Short summary shown under the meta block on the PDF"
								/>
							</div>

							{/* Lines */}
							<div className="space-y-2">
								<Label>Line items</Label>
								<ul className="space-y-2">
									{lines.map((l, i) => (
										<li
											key={l.key}
											className="grid gap-2 grid-cols-[1fr_120px_auto] items-center"
										>
											<Input
												value={l.description}
												onChange={(e) =>
													updateLine(l.key, { description: e.target.value })
												}
												placeholder={`Item ${i + 1}`}
											/>
											<Input
												type="number"
												step="0.01"
												min={0}
												value={l.amount}
												onChange={(e) => updateLine(l.key, { amount: e.target.value })}
												placeholder="0.00"
											/>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="text-destructive"
												onClick={() => removeLine(l.key)}
												disabled={lines.length === 1}
											>
												Remove
											</Button>
										</li>
									))}
								</ul>
								<Button type="button" variant="outline" size="sm" onClick={addLine}>
									+ Add line
								</Button>
							</div>

							{/* Totals breakdown */}
							<div className="rounded-md border border-foreground/10 bg-muted/30 p-3 space-y-1 text-sm">
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Subtotal</dt>
									<dd className="font-mono">{fmtMinor(subtotalCents)}</dd>
								</div>
								{discountCents > 0 && (
									<div className="flex justify-between text-primary">
										<dt>Discount applied</dt>
										<dd className="font-mono">-{fmtMinor(discountCents)}</dd>
									</div>
								)}
								{undershoot && (
									<div className="flex justify-between text-destructive">
										<dt>Short by</dt>
										<dd className="font-mono">{fmtMinor(targetCents - subtotalCents)}</dd>
									</div>
								)}
								<div className="flex justify-between pt-1 border-t border-foreground/10 font-medium">
									<dt>Invoice total</dt>
									<dd className="font-mono">{fmtMinor(totalCents)}</dd>
								</div>
							</div>

							{/* Notes */}
							<div className="space-y-1.5">
								<Label htmlFor="inv-notes">Footer note (optional)</Label>
								<Textarea
									id="inv-notes"
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
									rows={2}
									placeholder="Renders at the bottom of the PDF — e.g. payment instructions"
								/>
							</div>
						</div>

						<div className="flex items-center justify-between pt-2 border-t border-foreground/10">
							{mode === "edit" ? (
								<Button
									variant="ghost"
									size="sm"
									className="text-destructive hover:text-destructive"
									onClick={deleteInvoice}
									disabled={busy}
								>
									Delete invoice
								</Button>
							) : (
								<span />
							)}
							<div className="flex items-center gap-2">
								<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
									Cancel
								</Button>
								<Button onClick={save} disabled={busy}>
									{busy ? "Saving…" : submitLabel}
								</Button>
							</div>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
