"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Textarea } from "@/shadcn/components/ui/textarea";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import {
	approveBookingAction,
	rejectBookingAction,
	markBookingDepositPaidOfflineAction,
	issueBookingBalanceInvoiceAction,
	markBookingBalancePaidOfflineAction,
} from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

export default function BookingDetailActions({
	bookingId,
	status,
	depositRequiredCents = 0,
	depositPaidCents = 0,
	balancePaidCents = 0,
	totalCents = 0,
	balanceInvoiceIssuedAt = null,
}) {
	const router = useRouter();
	const [approveNote, setApproveNote] = useState("");
	const [rejectReason, setRejectReason] = useState("");
	const [busy, setBusy] = useState(null);
	const [error, setError] = useState(null);
	const [offlineDepositOpen, setOfflineDepositOpen] = useState(false);
	const [issueInvoiceOpen, setIssueInvoiceOpen] = useState(false);
	const [offlineBalanceOpen, setOfflineBalanceOpen] = useState(false);

	async function markDepositOffline() {
		setBusy("offline-deposit");
		setError(null);
		try {
			await markBookingDepositPaidOfflineAction({ booking_id: bookingId });
			router.refresh();
		} catch (err) {
			setError(err?.message || "Could not mark deposit paid.");
		} finally {
			setBusy(null);
		}
	}

	async function issueInvoice() {
		setBusy("issue-invoice");
		setError(null);
		try {
			await issueBookingBalanceInvoiceAction({ booking_id: bookingId });
			router.refresh();
		} catch (err) {
			setError(err?.message || "Could not issue invoice.");
		} finally {
			setBusy(null);
		}
	}

	async function markBalanceOffline() {
		setBusy("offline-balance");
		setError(null);
		try {
			await markBookingBalancePaidOfflineAction({ booking_id: bookingId });
			router.refresh();
		} catch (err) {
			setError(err?.message || "Could not mark balance paid.");
		} finally {
			setBusy(null);
		}
	}

	const outstanding = Math.max(0, totalCents - depositPaidCents - balancePaidCents);

	if (status === "approved" && depositRequiredCents > 0) {
		return (
			<section className="rounded-lg border bg-card p-6 space-y-4">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					Deposit
				</h2>
				{error && (
					<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
						{error}
					</div>
				)}
				<p className="text-sm text-foreground/85">
					Awaiting deposit. The hirer can pay via the link in their approval email.
				</p>
				<Button
					variant="outline"
					className="w-full"
					onClick={() => setOfflineDepositOpen(true)}
					disabled={busy !== null}
				>
					Mark deposit paid (offline)
				</Button>
				<ConfirmDialog
					open={offlineDepositOpen}
					onOpenChange={setOfflineDepositOpen}
					title="Mark deposit as paid offline?"
					description="Use this for bank transfers, cash, or any payment you've reconciled outside the PSP. The booking will flip to confirmed and the hirer will receive a confirmation email."
					confirmLabel="Mark paid"
					onConfirm={markDepositOffline}
				/>
			</section>
		);
	}

	if (status === "confirmed" && outstanding > 0) {
		return (
			<section className="rounded-lg border bg-card p-6 space-y-4">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					Balance
				</h2>
				{error && (
					<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
						{error}
					</div>
				)}
				<dl className="space-y-1 text-sm">
					<div className="flex items-baseline justify-between gap-3">
						<dt className="text-muted-foreground">Outstanding</dt>
						<dd className="font-display text-xl">{fmt(outstanding)}</dd>
					</div>
					{balanceInvoiceIssuedAt && (
						<div className="flex items-baseline justify-between gap-3">
							<dt className="text-muted-foreground">Invoice emailed</dt>
							<dd className="text-xs">
								{dateFmt.format(new Date(balanceInvoiceIssuedAt))}
							</dd>
						</div>
					)}
				</dl>
				<div className="space-y-2 border-t border-foreground/10 pt-4">
					<Button
						className="w-full"
						onClick={() => setIssueInvoiceOpen(true)}
						disabled={busy !== null}
					>
						{busy === "issue-invoice"
							? "Sending…"
							: balanceInvoiceIssuedAt
								? "Re-send balance invoice"
								: "Issue balance invoice"}
					</Button>
					<Button
						variant="outline"
						className="w-full"
						onClick={() => setOfflineBalanceOpen(true)}
						disabled={busy !== null}
					>
						Mark balance paid (offline)
					</Button>
				</div>
				<ConfirmDialog
					open={issueInvoiceOpen}
					onOpenChange={setIssueInvoiceOpen}
					title={balanceInvoiceIssuedAt ? "Re-send balance invoice?" : "Issue balance invoice?"}
					description="Emails the hirer with the outstanding amount and a link to pay. They can pay at any time via the link on their booking page - issuing prompts them by email."
					confirmLabel={balanceInvoiceIssuedAt ? "Re-send" : "Send invoice"}
					onConfirm={issueInvoice}
				/>
				<ConfirmDialog
					open={offlineBalanceOpen}
					onOpenChange={setOfflineBalanceOpen}
					title="Mark balance as paid offline?"
					description="Records the full outstanding balance as settled (bank transfer, cash, etc). The booking flips to completed and the hirer receives a confirmation email."
					confirmLabel="Mark paid"
					onConfirm={markBalanceOffline}
				/>
			</section>
		);
	}

	if (status !== "pending") {
		return (
			<section className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
				No actions available - this booking is{" "}
				<span className="font-medium text-foreground">{status}</span>.
			</section>
		);
	}

	async function approve() {
		setBusy("approve");
		setError(null);
		try {
			await approveBookingAction({ booking_id: bookingId, note: approveNote });
			router.refresh();
		} catch (err) {
			setError(err?.message || "Approval failed");
		} finally {
			setBusy(null);
		}
	}

	async function reject() {
		if (!rejectReason.trim()) {
			setError("A short reason helps the customer understand why.");
			return;
		}
		setBusy("reject");
		setError(null);
		try {
			await rejectBookingAction({ booking_id: bookingId, reason: rejectReason });
			router.refresh();
		} catch (err) {
			setError(err?.message || "Rejection failed");
		} finally {
			setBusy(null);
		}
	}

	return (
		<section className="rounded-lg border bg-card p-6 space-y-5">
			<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Actions</h2>

			{error && (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}

			<div className="space-y-2">
				<label className="text-sm font-medium">Approve</label>
				<Textarea
					rows={2}
					placeholder="Optional note to the customer (will appear in the confirmation email)…"
					value={approveNote}
					onChange={(e) => setApproveNote(e.target.value)}
				/>
				<Button onClick={approve} disabled={busy !== null} className="w-full">
					{busy === "approve" ? "Approving…" : "Approve booking"}
				</Button>
			</div>

			<div className="border-t border-foreground/10 pt-5 space-y-2">
				<label className="text-sm font-medium">Reject</label>
				<Textarea
					rows={3}
					placeholder="Reason for declining (shown to the customer)…"
					value={rejectReason}
					onChange={(e) => setRejectReason(e.target.value)}
				/>
				<Button
					onClick={reject}
					disabled={busy !== null}
					variant="outline"
					className="w-full"
				>
					{busy === "reject" ? "Rejecting…" : "Reject booking"}
				</Button>
			</div>
		</section>
	);
}
