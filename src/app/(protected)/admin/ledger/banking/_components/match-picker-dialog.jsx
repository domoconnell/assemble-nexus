"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/shadcn/components/ui/dialog";
import {
	listMatchCandidatesAction,
	manuallyMatchToInvoiceAction,
} from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtMinor = (m) => gbp.format((m ?? 0) / 100);

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

const TYPE_LABELS = {
	tenancy_invoice: "Tenancy",
	manual_invoice: "Invoice",
	booking_payment: "Booking",
};

const TYPE_PILL_CLASS = {
	tenancy_invoice: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	manual_invoice: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
	booking_payment: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

/**
 * Manual match picker — a last-resort fallback for cases the auto-matcher
 * abstains on (cross-org ambiguity, amount-only matches, etc).
 *
 * Lists every open candidate the bank transaction could plausibly link
 * to (tenancy invoices, manual invoices, unpaid booking payments) with
 * amount-match candidates floated to the top. Admin picks one, the
 * action mirrors the auto-matcher's side-effects exactly so the
 * resulting state is identical to "matched automatically".
 */
export default function MatchPickerDialog({ open, onOpenChange, transactionId }) {
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [transaction, setTransaction] = useState(null);
	const [candidates, setCandidates] = useState([]);
	const [filter, setFilter] = useState("");
	const [busyId, setBusyId] = useState(null);

	useEffect(() => {
		if (!open || !transactionId) return;
		let cancelled = false;
		setLoading(true);
		(async () => {
			try {
				const res = await listMatchCandidatesAction({
					transaction_id: transactionId,
				});
				if (cancelled) return;
				setTransaction(res.transaction);
				setCandidates(res.candidates);
			} catch (err) {
				toast.error(err?.message || "Couldn't load candidates");
				onOpenChange(false);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open, transactionId, onOpenChange]);

	const filtered = useMemo(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return candidates;
		return candidates.filter(
			(c) =>
				c.reference?.toLowerCase().includes(q) ||
				c.label?.toLowerCase().includes(q) ||
				TYPE_LABELS[c.type].toLowerCase().includes(q),
		);
	}, [candidates, filter]);

	async function pick(c) {
		setBusyId(c.id);
		try {
			await manuallyMatchToInvoiceAction({
				transaction_id: transactionId,
				target_type: c.type,
				target_id: c.id,
			});
			toast.success(`Matched to ${c.reference}`);
			onOpenChange(false);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't match");
		} finally {
			setBusyId(null);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="p-6 sm:p-8 max-w-2xl max-h-[85vh] overflow-y-auto space-y-4">
				<DialogHeader>
					<DialogTitle>Match to invoice or booking</DialogTitle>
					<DialogDescription>
						Pick what this bank receipt covers. Matches at the same amount
						appear at the top, but you can pick any candidate — useful when
						the customer paid early, late, or in a non-standard amount.
					</DialogDescription>
				</DialogHeader>

				{transaction && (
					<dl className="grid gap-2 text-sm rounded-md border border-foreground/10 bg-muted/30 p-3">
						<div className="flex items-baseline justify-between gap-3 min-w-0">
							<dt className="text-muted-foreground shrink-0">Received</dt>
							<dd className="font-mono">{fmtMinor(transaction.amount_minor)}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-3 min-w-0">
							<dt className="text-muted-foreground shrink-0">From</dt>
							<dd className="font-medium truncate min-w-0 text-right">
								{transaction.counterparty_name || "—"}
							</dd>
						</div>
						{transaction.reference && (
							<div className="flex items-baseline justify-between gap-3 min-w-0">
								<dt className="text-muted-foreground shrink-0">Reference</dt>
								<dd className="font-mono text-xs truncate min-w-0 text-right">
									{transaction.reference}
								</dd>
							</div>
						)}
					</dl>
				)}

				<div className="space-y-2">
					<Input
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="Filter by reference, organisation or type…"
						autoFocus
					/>
					{loading ? (
						<div className="text-sm text-muted-foreground py-8 text-center">
							Loading candidates…
						</div>
					) : filtered.length === 0 ? (
						<div className="text-sm text-muted-foreground py-8 text-center">
							{candidates.length === 0
								? "No open candidates available."
								: "No matches for that filter."}
						</div>
					) : (
						<ul className="divide-y divide-foreground/5 rounded-md border border-foreground/10 bg-background overflow-hidden">
							{filtered.map((c) => {
								const exact =
									transaction &&
									c.total_cents === transaction.amount_minor;
								return (
									<li key={`${c.type}-${c.id}`}>
										<button
											type="button"
											onClick={() => pick(c)}
											disabled={busyId !== null}
											className={`w-full text-left px-3 py-2.5 hover:bg-muted/30 transition disabled:opacity-50 ${
												exact ? "bg-primary/5" : ""
											}`}
										>
											<div className="flex items-baseline justify-between gap-3 min-w-0">
												<div className="min-w-0 flex-1 flex items-baseline gap-2 flex-wrap">
													<span
														className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-mono ${TYPE_PILL_CLASS[c.type]}`}
													>
														{TYPE_LABELS[c.type]}
													</span>
													<span className="font-mono text-xs text-muted-foreground truncate">
														{c.reference}
													</span>
													<span className="text-sm font-medium truncate">{c.label}</span>
													{exact && (
														<span className="text-[10px] uppercase tracking-[0.15em] text-primary">
															exact
														</span>
													)}
												</div>
												<div className="text-right shrink-0">
													<div className={`font-mono tabular-nums text-sm ${exact ? "text-primary font-semibold" : ""}`}>
														{fmtMinor(c.total_cents)}
													</div>
													<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
														{c.issued_at ? dateFmt.format(new Date(c.issued_at)) : ""}
													</div>
												</div>
											</div>
											{busyId === c.id && (
												<div className="mt-1.5 text-[11px] text-muted-foreground">Matching…</div>
											)}
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</div>

				<div className="flex justify-end pt-2 border-t border-foreground/10">
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
