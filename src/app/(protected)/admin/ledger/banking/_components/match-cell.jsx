"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/shadcn/components/ui/dropdown-menu";
import {
	unmatchTransactionAction,
	rematchTransactionAction,
	setChurchTransferFlagAction,
} from "../actions";
import CategoriseDialog from "./categorise-dialog";
import ManualInvoiceDialog from "./manual-invoice-dialog";
import MatchPickerDialog from "./match-picker-dialog";

/**
 * Match-state pill + context menu for a bank transaction. The menu adapts
 * to whether the row is incoming or outgoing and whether it's already
 * matched:
 *
 *   Outgoing, unmatched:
 *     · Categorise spending      (opens dialog → creates expense)
 *
 *   Incoming, unmatched:
 *     · Auto-match              (runs invoice auto-match for the venue)
 *     · Mark as refund          (opens dialog → creates expense kind=refund)
 *     · Create invoice          (placeholder, toast "Coming soon")
 *
 *   Already matched (any direction):
 *     · Unmatch                  (clears the link; soft-deletes the
 *                                 expense if the match was an expense)
 *     · Auto-match               (only for tenancy_invoice matches)
 */
export default function MatchCell({
	transactionId,
	direction,
	isTransfer = false,
	isFee = false,
	isChurchTransfer = false,
	matchedToType,
	matchedReference,
	matchedInvoiceStatus,
	matchedExpenseKind,
	matchedExpenseCategory,
	matchedRecurringType,
	matchedRecurringLabel,
	matchedManualInvoiceReference,
	matchedManualInvoiceId,
	matchedBookingPaymentLabel,
	matchedBookingPaymentDeleted,
	matchedBookingReference,
	matchedBookingId,
	matchedBookingDeleted,
	matchedTicketOrderReference,
	matchedTicketOrderEventId,
	matchedTicketOrderDeleted,
	matchedOrphanReference,
	transaction,
	categories,
	recurringGroups,
	organisations = [],
}) {
	const router = useRouter();
	// `pending` from useTransition stays true through the server action
	// AND through the router.refresh() data fetch that follows. A plain
	// useState flag flips off immediately after the action resolves —
	// which leaves a window where the cell renders the OLD (Unmatched)
	// props before the new ones land. That window is the "flash" the
	// user kept seeing.
	const [actionBusy, setActionBusy] = useState(false);
	const [pending, startTransition] = useTransition();
	const busy = actionBusy || pending;
	const [dialogKind, setDialogKind] = useState(null); // "spend" | "refund" | null
	const [invoiceDialog, setInvoiceDialog] = useState(null); // "create" | "edit" | null
	const [pickerOpen, setPickerOpen] = useState(false);

	function runWithRefresh(label, fn) {
		setActionBusy(true);
		startTransition(async () => {
			try {
				await fn();
				router.refresh();
			} catch (err) {
				toast.error(err?.message || `Couldn't ${label}`);
			} finally {
				setActionBusy(false);
			}
		});
	}

	// Synthetic PSP fee rows have nothing to match — keep them dashed.
	if (isFee) {
		return <span className="text-muted-foreground/60 text-xs">—</span>;
	}
	// Inter-account transfers don't need matching either, but the
	// "Transfer" pill belongs here now (previously in the counterparty
	// cell) so the Match column always carries the row's status.
	if (isTransfer) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-foreground/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] font-mono text-muted-foreground">
				Transfer
			</span>
		);
	}

	const isMatched = !!matchedToType;
	const matchedToInvoice = isMatched && matchedToType === "tenancy_invoice";
	const matchedToExpense = isMatched && matchedToType === "expense";
	const matchedToRecurring = isMatched && matchedToType === "recurring_cost_item";
	const matchedToManualInvoice = isMatched && matchedToType === "manual_invoice";
	const matchedToBookingPayment = isMatched && matchedToType === "booking_payment";
	const matchedToTicketOrder = isMatched && matchedToType === "ticket_order";
	// A Stripe charge whose originating booking / payment / order was
	// hard-deleted before the bank receipt arrived. The audit data sits
	// on `raw_payload.source.metadata`; the matcher set
	// matched_to_type='stripe_orphan' with no matched_to_id.
	const matchedToStripeOrphan = isMatched && matchedToType === "stripe_orphan";
	// Either the payment row itself or its parent booking was soft-deleted
	// after the bank transaction came in. The match is still valid for
	// audit / reconciliation but the entity isn't navigable anymore.
	const bookingPaymentGone =
		matchedToBookingPayment && (!!matchedBookingPaymentDeleted || !!matchedBookingDeleted);
	const ticketOrderGone = matchedToTicketOrder && !!matchedTicketOrderDeleted;
	const isOutgoing = direction === "OUT";
	const isIncoming = direction === "IN";

	// "View entity" link target per matched type. Returns null when there's
	// no useful drill-down (e.g. expenses are list-only — no detail page).
	function viewHref() {
		if (matchedToInvoice && transaction?.matched_tenancy_id) {
			return `/admin/tenancies/${transaction.matched_tenancy_id}`;
		}
		if (matchedToInvoice) return `/admin/tenancies`;
		if (matchedToExpense) return `/admin/ledger/expenses`;
		if (matchedToRecurring) return `/admin/ledger/recurring`;
		// Don't link to a soft-deleted entity — its detail page would
		// either 404 or render an empty husk.
		if (matchedToBookingPayment && matchedBookingId && !bookingPaymentGone) {
			// Anchor-scroll straight to the matched payment row so the
			// admin doesn't have to find it inside the booking page.
			// matched_to_id is the booking_payment.id.
			const anchor = transaction?.matched_to_id ?? "";
			return anchor
				? `/admin/bookings/${matchedBookingId}#payment-${anchor}`
				: `/admin/bookings/${matchedBookingId}`;
		}
		if (matchedToTicketOrder && matchedTicketOrderEventId && !ticketOrderGone) {
			return `/admin/events/${matchedTicketOrderEventId}`;
		}
		return null;
	}
	const viewLink = viewHref();
	const viewLabel = matchedToInvoice
		? "View tenancy"
		: matchedToExpense
			? "View expense"
			: matchedToRecurring
				? "View recurring item"
				: matchedToBookingPayment
					? "View booking"
					: matchedToTicketOrder
						? "View event"
						: "View";

	const RECURRING_TYPE_LABELS = {
		utilities: "Utilities",
		staff: "Staff",
		mortgage: "Mortgage",
		mortgage_extra: "Extra mortgage",
	};

	function unmatch() {
		runWithRefresh("unmatch", async () => {
			await unmatchTransactionAction({ transaction_id: transactionId });
			toast.success("Unmatched");
		});
	}

	function autoMatch() {
		runWithRefresh("auto-match", async () => {
			const res = await rematchTransactionAction({ transaction_id: transactionId });
			if (res?.matched > 0) {
				toast.success(`Matched (${res.matched})`);
			} else if (res?.ambiguous > 0) {
				toast.info("Multiple candidates — pick manually from the invoice.");
			} else {
				toast.info("No match found.");
			}
		});
	}

	function downloadManualInvoice() {
		if (!matchedManualInvoiceId) return;
		window.location.href = `/api/admin/manual-invoices/${matchedManualInvoiceId}/pdf`;
	}

	function toggleChurchTransfer() {
		runWithRefresh("update", async () => {
			await setChurchTransferFlagAction({
				transaction_id: transactionId,
				is_church_transfer: !isChurchTransfer,
			});
			toast.success(isChurchTransfer ? "Untagged" : "Tagged as church transfer");
		});
	}

	// Pill visual + label
	let pillClass = "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
	let label = isOutgoing ? "To categorise" : "Unmatched";
	if (matchedToInvoice) {
		pillClass = "border-primary/30 bg-primary/10 text-primary";
		label = matchedReference ?? "Matched";
	} else if (matchedToExpense) {
		pillClass = "border-primary/30 bg-primary/10 text-primary";
		const cat = matchedExpenseCategory ?? "Categorised";
		label = matchedExpenseKind === "refund" ? `Refund · ${cat}` : cat;
	} else if (matchedToRecurring) {
		pillClass = "border-primary/30 bg-primary/10 text-primary";
		const typeLabel = RECURRING_TYPE_LABELS[matchedRecurringType] ?? matchedRecurringType;
		label = matchedRecurringLabel
			? `${typeLabel} · ${matchedRecurringLabel}`
			: typeLabel ?? "Recurring";
	} else if (matchedToManualInvoice) {
		pillClass = "border-primary/30 bg-primary/10 text-primary";
		label = matchedManualInvoiceReference ?? "Invoice";
	} else if (matchedToBookingPayment) {
		// Soft-deleted bookings render with the muted "gone" pill so the
		// row reads as reconciled (matched) but obviously orphan'd.
		if (bookingPaymentGone) {
			pillClass = "border-muted-foreground/30 bg-muted/50 text-muted-foreground line-through";
			label = matchedBookingReference
				? `${matchedBookingReference} (deleted)`
				: "Deleted booking";
		} else {
			pillClass = "border-primary/30 bg-primary/10 text-primary";
			label = matchedBookingReference
				? `${matchedBookingReference}${matchedBookingPaymentLabel ? ` · ${matchedBookingPaymentLabel}` : ""}`
				: matchedBookingPaymentLabel ?? "Booking";
		}
	} else if (matchedToTicketOrder) {
		if (ticketOrderGone) {
			pillClass = "border-muted-foreground/30 bg-muted/50 text-muted-foreground line-through";
			label = matchedTicketOrderReference
				? `${matchedTicketOrderReference} (deleted)`
				: "Deleted order";
		} else {
			pillClass = "border-primary/30 bg-primary/10 text-primary";
			label = matchedTicketOrderReference ?? "Tickets";
		}
	} else if (matchedToStripeOrphan) {
		// Stripe charge for a now-deleted booking/order. Read the
		// original BK-/TIX- reference out of the receipt metadata so the
		// audit trail is still visible.
		pillClass = "border-muted-foreground/30 bg-muted/50 text-muted-foreground";
		label = matchedOrphanReference
			? `${matchedOrphanReference} (orphan)`
			: "Stripe orphan";
	} else if (!isMatched && isChurchTransfer) {
		// Unmatched outgoing that the admin has tagged as a church gift —
		// surface that as the pill state rather than the generic "to
		// categorise", so the row reads as DONE in the table.
		pillClass = "border-primary/30 bg-primary/10 text-primary";
		label = "Church transfer";
	}

	const title = isMatched
		? matchedToExpense
			? `Categorised as ${matchedExpenseCategory ?? "expense"}${
					matchedExpenseKind === "refund" ? " (refund)" : ""
				}`
			: matchedToRecurring
				? `Recurring: ${RECURRING_TYPE_LABELS[matchedRecurringType] ?? matchedRecurringType}${matchedRecurringLabel ? ` · ${matchedRecurringLabel}` : ""}`
				: `Matched to ${matchedReference ?? "invoice"} (${matchedInvoiceStatus ?? "paid"})`
		: "Click for options";

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={busy}
						className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] font-mono hover:opacity-80 transition ${pillClass} ${busy ? "opacity-60" : ""}`}
						title={title}
					>
						{busy ? "…" : label}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					{/* Matched manual invoice — promote download + edit to the top
					 * since those are what the user clicked the pill to do. */}
					{matchedToManualInvoice && (
						<>
							<DropdownMenuItem onClick={downloadManualInvoice}>
								Download invoice
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setInvoiceDialog("edit")}>
								Edit invoice
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					{/* Generic "View ..." for the other matched types that have a
					 * sensible drill-down page. */}
					{isMatched && viewLink && !matchedToManualInvoice && (
						<>
							<DropdownMenuItem asChild>
								<a href={viewLink}>{viewLabel}</a>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					{isMatched && (
						<>
							<DropdownMenuItem onClick={unmatch}>Unmatch</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					{isIncoming &&
						!matchedToExpense &&
						!matchedToManualInvoice &&
						!matchedToBookingPayment &&
						!matchedToTicketOrder && (
							<DropdownMenuItem onClick={autoMatch}>
								{matchedToInvoice ? "Rematch" : "Auto-match"}
							</DropdownMenuItem>
						)}
					{!isMatched && isOutgoing && (
						<>
							<DropdownMenuItem onClick={() => setDialogKind("spend")}>
								Categorise spending
							</DropdownMenuItem>
							<DropdownMenuItem onClick={toggleChurchTransfer}>
								{isChurchTransfer ? "Untag church transfer" : "Mark as church transfer"}
							</DropdownMenuItem>
						</>
					)}
					{!isMatched && isIncoming && (
						<>
							<DropdownMenuItem onClick={() => setPickerOpen(true)}>
								Match to invoice…
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setDialogKind("refund")}>
								Mark as refund
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setInvoiceDialog("create")}>
								Create invoice
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			{dialogKind && (
				<CategoriseDialog
					open
					onOpenChange={(o) => !o && setDialogKind(null)}
					kind={dialogKind}
					transaction={transaction ?? { id: transactionId }}
					categories={categories ?? []}
					recurringGroups={recurringGroups ?? []}
				/>
			)}

			{invoiceDialog && (
				<ManualInvoiceDialog
					open
					onOpenChange={(o) => !o && setInvoiceDialog(null)}
					mode={invoiceDialog}
					bankTransaction={
						invoiceDialog === "create" ? (transaction ?? { id: transactionId }) : null
					}
					invoiceId={invoiceDialog === "edit" ? matchedManualInvoiceId : null}
					organisations={organisations}
				/>
			)}

			{pickerOpen && (
				<MatchPickerDialog
					open
					onOpenChange={setPickerOpen}
					transactionId={transactionId}
				/>
			)}
		</>
	);
}
