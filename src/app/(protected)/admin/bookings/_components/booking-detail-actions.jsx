"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Textarea } from "@/shadcn/components/ui/textarea";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import { Input } from "@/shadcn/components/ui/input";
import {
	approveBookingAction,
	rejectBookingAction,
	cancelBookingAction,
	overrideBookingTotalAction,
} from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

export default function BookingDetailActions({
	bookingId,
	status,
	depositRequiredCents = 0,
	depositPaidCents = 0,
	balancePaidCents = 0,
	totalCents = 0,
	subtotalCents = 0,
	vatCents = 0,
	balanceInvoiceIssuedAt = null,
	createdByAdmin = false,
}) {
	const router = useRouter();
	const [approveNote, setApproveNote] = useState("");
	const [approveSilent, setApproveSilent] = useState(false);
	const [rejectReason, setRejectReason] = useState("");
	const [rejectSilent, setRejectSilent] = useState(false);
	const [cancelReason, setCancelReason] = useState("");
	const [cancelOpen, setCancelOpen] = useState(false);
	const [busy, setBusy] = useState(null);
	const [error, setError] = useState(null);
	const [priceOpen, setPriceOpen] = useState(false);
	const [overridePounds, setOverridePounds] = useState(
		((totalCents ?? 0) / 100).toFixed(2),
	);

	// Customer submissions show "Approve". Admin-created bookings show
	// "Confirm" — the admin isn't reviewing someone else's enquiry, they're
	// just locking in something they entered.
	const approveLabel = createdByAdmin ? "Confirm" : "Approve";
	const approveActiveLabel = createdByAdmin ? "Confirming…" : "Approving…";
	const approveSubmitLabel = createdByAdmin ? "Confirm booking" : "Approve booking";

	async function saveOverride() {
		setBusy("override-price");
		setError(null);
		try {
			await overrideBookingTotalAction({
				booking_id: bookingId,
				total_pounds: Number(overridePounds),
			});
			setPriceOpen(false);
			router.refresh();
		} catch (err) {
			setError(err?.message || "Could not update price.");
		} finally {
			setBusy(null);
		}
	}

	async function cancel() {
		setBusy("cancel");
		setError(null);
		try {
			await cancelBookingAction({ booking_id: bookingId, reason: cancelReason || null });
			setCancelOpen(false);
			router.refresh();
		} catch (err) {
			setError(err?.message || "Cancellation failed.");
		} finally {
			setBusy(null);
		}
	}

	if (status !== "pending") {
		const isTerminal = status === "cancelled" || status === "rejected";
		return (
			<section className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-3">
				<h2 className="text-sm uppercase tracking-[0.2em] text-destructive">
					Danger zone
				</h2>
				{error && (
					<div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{error}
					</div>
				)}
				{isTerminal ? (
					<p className="text-sm text-muted-foreground">
						This booking is <span className="font-medium text-foreground">{status}</span>.
						Nothing further to do.
					</p>
				) : (
					<div className="space-y-2">
						<p className="text-sm text-foreground/80">
							Cancelling flips this {status} booking to <strong>cancelled</strong>.
							The customer is <strong>not</strong> emailed - they&apos;ll only see
							the change if they revisit their booking link.
						</p>
						<Textarea
							rows={3}
							placeholder="Reason (internal note, kept on the booking history)…"
							value={cancelReason}
							onChange={(e) => setCancelReason(e.target.value)}
						/>
						<Button
							variant="outline"
							onClick={() => setCancelOpen(true)}
							disabled={busy !== null}
							className="border-destructive/40 text-destructive hover:bg-destructive/10"
						>
							Cancel booking
						</Button>
					</div>
				)}
				<ConfirmDialog
					open={cancelOpen}
					onOpenChange={setCancelOpen}
					title="Cancel this booking?"
					description="The booking moves to 'cancelled' silently - no email goes out. Segments and history stay on file for the audit trail."
					confirmLabel={busy === "cancel" ? "Cancelling…" : "Cancel booking"}
					destructive
					onConfirm={cancel}
				/>
			</section>
		);
	}

	async function approve() {
		setBusy("approve");
		setError(null);
		try {
			await approveBookingAction({ booking_id: bookingId, note: approveNote, silent: approveSilent });
			router.refresh();
		} catch (err) {
			setError(err?.message || "Approval failed");
		} finally {
			setBusy(null);
		}
	}

	async function reject() {
		if (!rejectReason.trim() && !rejectSilent) {
			setError("A short reason helps the customer understand why - or tick \"Don't email\" to skip the email entirely.");
			return;
		}
		setBusy("reject");
		setError(null);
		try {
			await rejectBookingAction({
				booking_id: bookingId,
				reason: rejectReason || null,
				silent: rejectSilent,
			});
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
				<div className="flex items-baseline justify-between">
					<label className="text-sm font-medium">Price override</label>
					{!priceOpen && (
						<button
							type="button"
							className="text-xs text-muted-foreground hover:text-foreground underline"
							onClick={() => setPriceOpen(true)}
						>
							Change
						</button>
					)}
				</div>
				{!priceOpen ? (
					<p className="text-xs text-muted-foreground">
						Total quoted is <span className="font-mono text-foreground">{fmt(totalCents)}</span>.
						Use this to lock in a different figure (e.g. a goodwill discount) before
						{" "}{createdByAdmin ? "confirming" : "approving"}.
					</p>
				) : (
					<div className="space-y-2">
						<Input
							type="number"
							min={0}
							step="0.01"
							value={overridePounds}
							onChange={(e) => setOverridePounds(e.target.value)}
							placeholder="Total (£)"
						/>
						<p className="text-[11px] text-muted-foreground">
							VAT will be recomputed proportionally
							{vatCents > 0 ? ` (${Math.round((vatCents / Math.max(1, totalCents)) * 1000) / 10}% VAT)` : ""}.
						</p>
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								onClick={saveOverride}
								disabled={busy !== null || !overridePounds}
							>
								{busy === "override-price" ? "Saving…" : "Save"}
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									setPriceOpen(false);
									setOverridePounds(((totalCents ?? 0) / 100).toFixed(2));
								}}
								disabled={busy !== null}
							>
								Cancel
							</Button>
						</div>
					</div>
				)}
			</div>

			<div className="border-t border-foreground/10 pt-5 space-y-2">
				<label className="text-sm font-medium">{approveLabel}</label>
				<Textarea
					rows={2}
					placeholder="Optional note to the customer (will appear in the confirmation email)…"
					value={approveNote}
					onChange={(e) => setApproveNote(e.target.value)}
				/>
				<label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
					<input
						type="checkbox"
						checked={approveSilent}
						onChange={(e) => setApproveSilent(e.target.checked)}
						className="rounded border-foreground/30"
					/>
					Don&apos;t email the customer
				</label>
				<Button onClick={approve} disabled={busy !== null} className="w-full">
					{busy === "approve" ? approveActiveLabel : approveSubmitLabel}
				</Button>
			</div>

			<div className="border-t border-foreground/10 pt-5 space-y-2">
				<label className="text-sm font-medium">Reject</label>
				<Textarea
					rows={3}
					placeholder={rejectSilent
						? "Reason (internal note, not sent to the customer)…"
						: "Reason for declining (shown to the customer)…"}
					value={rejectReason}
					onChange={(e) => setRejectReason(e.target.value)}
				/>
				<label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
					<input
						type="checkbox"
						checked={rejectSilent}
						onChange={(e) => setRejectSilent(e.target.checked)}
						className="rounded border-foreground/30"
					/>
					Don&apos;t email the customer
				</label>
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
