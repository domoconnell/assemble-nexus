"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Label } from "@/shadcn/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shadcn/components/ui/dialog";
import { DatePicker } from "@/site/booking/date-picker";
import {
	voidTenancyInvoiceAction,
	deleteTenancyInvoiceAction,
	createTenancyInvoiceAction,
	chargeTenancyInvoiceAction,
	sendTenancyInvoiceAction,
	listUnmatchedBankTransactionsAction,
	reconcileTenancyInvoiceAction,
	unreconcileTenancyInvoiceAction,
} from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtGbp = (c) => gbp.format((c ?? 0) / 100);

const monthFmt = new Intl.DateTimeFormat("en-GB", {
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});
const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});

const STATUS_STYLES = {
	draft: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	issued: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	paid: "border-primary/30 bg-primary/10 text-primary",
	void: "border-foreground/15 text-muted-foreground",
};

const DD_CHARGE_STYLES = {
	pending: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	processing: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	succeeded: "border-primary/30 bg-primary/10 text-primary",
	failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

function StatusBadge({ status }) {
	return (
		<span
			className={`text-[10px] uppercase tracking-[0.18em] rounded-full border px-2 py-0.5 ${STATUS_STYLES[status] || STATUS_STYLES.void}`}
		>
			{status}
		</span>
	);
}

function DdChargeBadge({ status }) {
	if (!status) return null;
	return (
		<span
			className={`text-[10px] uppercase tracking-[0.18em] rounded-full border px-2 py-0.5 ${DD_CHARGE_STYLES[status] || "border-foreground/15 text-muted-foreground"}`}
		>
			DD · {status}
		</span>
	);
}

function todayLondon() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/London",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function todayLondonFirstOfMonth() {
	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/London",
		year: "numeric",
		month: "2-digit",
	});
	return `${fmt.format(new Date())}-01`;
}

function ymdToPeriod(ymd) {
	return ymd ? ymd.slice(0, 7) : "";
}

const periodMonthFmt = new Intl.DateTimeFormat("en-GB", {
	month: "long",
	year: "numeric",
	timeZone: "Europe/London",
});

function formatPeriodLabel(ymd) {
	if (!ymd) return "";
	const [y, m] = ymd.split("-").map(Number);
	return periodMonthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

function dayOfMonthLabel(d) {
	const n = Number(d) || 1;
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export default function InvoicesSection({
	invoices,
	invoiceDayOfMonth,
	tenancyId,
	tenancyStartsOn,
	ddReady,
	allowCreate = true,
}) {
	const router = useRouter();
	const [busyId, setBusyId] = useState(null);
	const [creating, setCreating] = useState(false);
	const [createBusy, setCreateBusy] = useState(false);
	// Both fields are full YYYY-MM-DD so we can drive them with the same
	// shadcn DatePicker. The period only cares about month + year.
	const [createPeriodDate, setCreatePeriodDate] = useState(todayLondonFirstOfMonth());
	const [createIssuedOn, setCreateIssuedOn] = useState(todayLondon());
	const [reconcilingInvoice, setReconcilingInvoice] = useState(null);

	async function confirmCreate() {
		setCreateBusy(true);
		try {
			await createTenancyInvoiceAction({
				tenancy_id: tenancyId,
				period_ym: ymdToPeriod(createPeriodDate),
				issued_on: createIssuedOn,
			});
			toast.success("Invoice created");
			setCreating(false);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not create invoice.");
		} finally {
			setCreateBusy(false);
		}
	}

	async function deleteInvoice(id) {
		setBusyId(id);
		try {
			await deleteTenancyInvoiceAction(id);
			toast.success("Invoice deleted");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not delete invoice.");
		} finally {
			setBusyId(null);
		}
	}

	async function takeByDirectDebit(id) {
		setBusyId(id);
		try {
			const res = await chargeTenancyInvoiceAction(id);
			toast.success(`DD charge submitted (${res.status})`);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not submit DD charge.");
		} finally {
			setBusyId(null);
		}
	}

	async function sendInvoice(id) {
		setBusyId(id);
		try {
			await sendTenancyInvoiceAction(id);
			toast.success("Invoice sent");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not send invoice.");
		} finally {
			setBusyId(null);
		}
	}

	async function voidInvoice(id) {
		setBusyId(id);
		try {
			await voidTenancyInvoiceAction(id);
			toast.success("Invoice voided");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not void invoice.");
		} finally {
			setBusyId(null);
		}
	}

	async function undoReconcile(id) {
		setBusyId(id);
		try {
			await unreconcileTenancyInvoiceAction(id);
			toast.success("Reconciliation cleared");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not undo reconciliation.");
		} finally {
			setBusyId(null);
		}
	}

	return (
		<section className="space-y-3">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Invoices · {invoices.length}
				</h2>
				{allowCreate && tenancyId && !creating && (
					<Button size="sm" onClick={() => setCreating(true)}>
						Create invoice
					</Button>
				)}
			</div>

			{creating && (
				<div className="rounded-lg border bg-card p-4 space-y-3">
					<div className="text-sm font-medium">Create invoice</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label className="text-xs">Period</Label>
							<DatePicker
								value={createPeriodDate}
								onChange={setCreatePeriodDate}
								allowPast
								placeholder="Pick any date in the month"
							/>
							<p className="text-[11px] text-muted-foreground">
								{createPeriodDate
									? `Billing for ${formatPeriodLabel(ymdToPeriod(createPeriodDate))}`
									: "Pick any date in the month you want to bill."}
							</p>
						</div>
						<div className="space-y-1.5">
							<Label className="text-xs">Invoice date</Label>
							<DatePicker
								value={createIssuedOn}
								onChange={setCreateIssuedOn}
								allowPast
							/>
						</div>
					</div>
					<div className="flex items-center justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setCreating(false)}
							disabled={createBusy}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={confirmCreate}
							disabled={createBusy || !createPeriodDate || !createIssuedOn}
						>
							{createBusy ? "Creating…" : "Create"}
						</Button>
					</div>
				</div>
			)}

			{invoices.length === 0 ? (
				<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
					No invoices yet. The daily cron will generate one on the{" "}
					{dayOfMonthLabel(invoiceDayOfMonth)} of each month.
				</div>
			) : (
				<div className="rounded-lg border bg-card overflow-hidden">
					<table className="w-full text-sm">
						<thead className="bg-muted/30 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							<tr>
								<th className="text-left px-3 py-2 font-medium">Period</th>
								<th className="text-left px-3 py-2 font-medium">Reference</th>
								<th className="text-left px-3 py-2 font-medium">Status</th>
								<th className="text-right px-3 py-2 font-medium">Total</th>
								<th className="text-right px-3 py-2 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-foreground/10">
							{invoices.map((inv) => {
								const isBusy = busyId === inv.id;
								const charging = ["pending", "processing", "succeeded"].includes(
									inv.dd_charge_status ?? "",
								);
								const canCharge =
									ddReady &&
									inv.status === "issued" &&
									!charging;
								const canReconcile = inv.status === "issued";
								const canSend = inv.status !== "void";
								const canVoid = inv.status === "issued" || inv.status === "draft";
								return (
									<tr key={inv.id} className="align-top">
										<td className="px-3 py-2 whitespace-nowrap">
											<div className="font-medium">
												{monthFmt.format(new Date(`${inv.period_ym}-01T00:00:00Z`))}
											</div>
											{inv.paid_at && (
												<div className="text-[10px] text-muted-foreground">
													Paid {dateFmt.format(new Date(inv.paid_at))}
												</div>
											)}
										</td>
										<td className="px-3 py-2 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
											{inv.reference}
										</td>
										<td className="px-3 py-2 whitespace-nowrap">
											<div className="flex flex-wrap items-center gap-1">
												<StatusBadge status={inv.status} />
												<DdChargeBadge status={inv.dd_charge_status} />
											</div>
										</td>
										<td className="px-3 py-2 text-right font-mono tabular-nums">
											{fmtGbp(inv.total_cents)}
										</td>
										<td className="px-3 py-2">
											<div className="flex flex-wrap items-center justify-end gap-2">
												{canReconcile && (
													<Button
														size="sm"
														variant="outline"
														onClick={() => setReconcilingInvoice(inv)}
														disabled={isBusy}
													>
														Reconcile
													</Button>
												)}
												{canVoid && (
													<Button
														size="sm"
														variant="ghost"
														onClick={() => voidInvoice(inv.id)}
														disabled={isBusy}
													>
														Void
													</Button>
												)}
												{inv.status !== "paid" && (
													<Button
														size="sm"
														variant="ghost"
														onClick={() => deleteInvoice(inv.id)}
														disabled={isBusy}
														className="text-destructive hover:text-destructive"
													>
														Delete
													</Button>
												)}
												{canSend && (
													<Button
														size="sm"
														variant="ghost"
														onClick={() => sendInvoice(inv.id)}
														disabled={isBusy}
													>
														Send
													</Button>
												)}
												<a
													href={`/api/admin/tenancy-invoices/${inv.id}/pdf`}
													target="_blank"
													rel="noreferrer"
													className="text-xs text-primary hover:underline px-2 py-1"
												>
													Download
												</a>
												{canCharge && (
													<Button
														size="sm"
														variant="outline"
														onClick={() => takeByDirectDebit(inv.id)}
														disabled={isBusy}
													>
														Take by DD
													</Button>
												)}
												{inv.status === "paid" && (
													<Button
														size="sm"
														variant="ghost"
														onClick={() => undoReconcile(inv.id)}
														disabled={isBusy}
													>
														Undo
													</Button>
												)}
											</div>
											<InvoiceBreakdown invoice={inv} />
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			<ReconcileDialog
				invoice={reconcilingInvoice}
				onClose={() => setReconcilingInvoice(null)}
				onDone={() => {
					setReconcilingInvoice(null);
					router.refresh();
				}}
			/>
		</section>
	);
}

/**
 * Compact breakdown panel — surfaces the headline figures (standard
 * rate total, reduced total, fixed-fee adjustment, total reduction).
 * Tucks under the action buttons in each invoice row so the row stays
 * one line while the math is one click away on the PDF.
 */
function InvoiceBreakdown({ invoice }) {
	const [open, setOpen] = useState(false);
	const standardRateTotal = invoice.rack_subtotal_cents ?? invoice.subtotal_cents ?? 0;
	const grandTotal = invoice.subtotal_cents ?? 0;
	const uncapped = invoice.uncapped_subtotal_cents;
	const reducedTotal = uncapped != null ? uncapped : grandTotal;
	const hasFixedFeeAdjustment = uncapped != null;
	const fixedFeeAdjustment = reducedTotal - grandTotal;
	const totalReduction = standardRateTotal - grandTotal;
	const hasReduction = totalReduction !== 0;
	const hasLineDiscount = standardRateTotal !== reducedTotal;
	const anyDetail = hasLineDiscount || hasFixedFeeAdjustment || hasReduction;
	if (!anyDetail) return null;

	return (
		<details
			className="mt-2"
			open={open}
			onToggle={(e) => setOpen(e.currentTarget.open)}
		>
			<summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground text-right">
				{open ? "Hide breakdown" : "Show breakdown"}
			</summary>
			<div className="mt-2 rounded-md border border-foreground/10 bg-muted/20 p-3 text-xs space-y-1">
				<div className="flex items-baseline justify-between gap-2">
					<span className="text-muted-foreground">Standard rate total</span>
					<span className="font-mono tabular-nums">{fmtGbp(standardRateTotal)}</span>
				</div>
				<div className="flex items-baseline justify-between gap-2">
					<span className="text-muted-foreground">Reduced total</span>
					<span className="font-mono tabular-nums">{fmtGbp(reducedTotal)}</span>
				</div>
				{hasFixedFeeAdjustment && (
					<div className="flex items-baseline justify-between gap-2">
						<span className="text-muted-foreground">Fixed fee adjustment</span>
						<span
							className={`font-mono tabular-nums ${fixedFeeAdjustment > 0 ? "text-primary" : fixedFeeAdjustment < 0 ? "text-destructive" : ""}`}
						>
							{fixedFeeAdjustment > 0 ? "−" : "+"}
							{fmtGbp(Math.abs(fixedFeeAdjustment))}
						</span>
					</div>
				)}
				<div className="flex items-baseline justify-between gap-2 pt-1 border-t border-foreground/10">
					<span className="font-medium">Grand total</span>
					<span className="font-mono tabular-nums font-medium">{fmtGbp(grandTotal)}</span>
				</div>
				{hasReduction && (
					<div className="flex items-baseline justify-between gap-2">
						<span className="text-muted-foreground font-medium">Total reduction</span>
						<span
							className={`font-mono tabular-nums font-medium ${totalReduction > 0 ? "text-primary" : "text-destructive"}`}
						>
							{totalReduction > 0 ? "−" : "+"}
							{fmtGbp(Math.abs(totalReduction))}
						</span>
					</div>
				)}
			</div>
		</details>
	);
}

/**
 * Reconcile dialog: pick a bank-transaction line that paid this invoice.
 * Loads unmatched inbound transactions lazily when opened and offers an
 * "amount matches" filter so the admin doesn't have to scroll a long
 * feed to find the right one.
 */
function ReconcileDialog({ invoice, onClose, onDone }) {
	const [loading, setLoading] = useState(false);
	const [transactions, setTransactions] = useState([]);
	const [matchAmountOnly, setMatchAmountOnly] = useState(true);
	const [submittingId, setSubmittingId] = useState(null);

	useEffect(() => {
		if (!invoice) return;
		setLoading(true);
		listUnmatchedBankTransactionsAction()
			.then((rows) => setTransactions(rows))
			.catch((err) => toast.error(err?.message || "Could not load bank feed."))
			.finally(() => setLoading(false));
	}, [invoice]);

	if (!invoice) return null;

	const target = invoice.total_cents ?? 0;
	const filtered = matchAmountOnly
		? transactions.filter((tx) => tx.amount_minor === target)
		: transactions;

	async function pick(txId) {
		setSubmittingId(txId);
		try {
			await reconcileTenancyInvoiceAction({
				invoice_id: invoice.id,
				transaction_id: txId,
			});
			toast.success("Reconciled");
			onDone();
		} catch (err) {
			toast.error(err?.message || "Could not reconcile.");
		} finally {
			setSubmittingId(null);
		}
	}

	return (
		<Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Reconcile {invoice.reference}</DialogTitle>
					<DialogDescription>
						Pick the bank line that paid this invoice. The transaction will
						be linked, the invoice flipped to paid, and `paid_at` set to the
						transaction's settlement date.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="flex items-center justify-between gap-3 text-xs">
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={matchAmountOnly}
								onChange={(e) => setMatchAmountOnly(e.target.checked)}
							/>
							Only show £{(target / 100).toFixed(2)} matches
						</label>
						<span className="text-muted-foreground">
							{filtered.length} unmatched
						</span>
					</div>
					{loading ? (
						<div className="text-sm text-muted-foreground py-8 text-center">
							Loading bank feed…
						</div>
					) : filtered.length === 0 ? (
						<div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
							{matchAmountOnly
								? "No unmatched bank lines for that exact amount. Untick the filter to see all unmatched inbound transactions."
								: "No unmatched inbound bank transactions."}
						</div>
					) : (
						<ul className="rounded-md border bg-background divide-y divide-foreground/10 max-h-96 overflow-y-auto">
							{filtered.map((tx) => {
								const when = tx.transaction_time || tx.settled_at;
								return (
									<li
										key={tx.id}
										className="flex items-baseline justify-between gap-3 px-3 py-2"
									>
										<div className="min-w-0">
											<div className="text-sm truncate">
												{tx.counterparty_name || "(no counterparty)"}
											</div>
											<div className="text-[11px] text-muted-foreground">
												{when ? dateFmt.format(new Date(when)) : "—"}
												{tx.reference ? ` · ${tx.reference}` : ""}
											</div>
										</div>
										<div className="flex items-center gap-2 shrink-0">
											<span className="text-sm font-mono tabular-nums">
												{fmtGbp(tx.amount_minor)}
											</span>
											<Button
												size="sm"
												onClick={() => pick(tx.id)}
												disabled={submittingId === tx.id}
											>
												{submittingId === tx.id ? "Linking…" : "Link"}
											</Button>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
