"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import {
	replaceBookingPaymentsAction,
	markBookingPaymentPaidOfflineAction,
	unmarkBookingPaymentPaidAction,
	sendBookingPaymentLinkAction,
} from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const STRIPE_MIN_CENTS = 30;

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

function newDraft(amountCents = 0, label = "Payment") {
	return {
		key: Math.random().toString(36).slice(2, 10),
		label,
		amount_pounds: (amountCents / 100).toFixed(2),
	};
}

/**
 * Replace the legacy "Deposit required" text panel with a full instalments
 * editor. Paid rows are read-only; unpaid rows can be edited together so the
 * sum stays equal to the outstanding balance.
 *
 * On the public side each unpaid row has a `pay_token` that resolves to
 * `/booking/[reference]/pay-installment/[token]` — copy the link from
 * the row, or send it via email through the action.
 */
export default function InstallmentsEditor({ bookingId, reference, totalCents, payments }) {
	const router = useRouter();
	const [editing, setEditing] = useState(false);
	const [drafts, setDrafts] = useState(() =>
		payments
			.filter((p) => !p.paid_at)
			.map((p) => ({
				key: p.id,
				label: p.label,
				amount_pounds: ((p.amount_cents ?? 0) / 100).toFixed(2),
			})),
	);
	const [busy, setBusy] = useState(null);

	const paidSum = payments
		.filter((p) => p.paid_at)
		.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
	const outstandingCents = (totalCents ?? 0) - paidSum;

	const draftSumCents = useMemo(
		() =>
			drafts.reduce((s, d) => s + Math.round(Number(d.amount_pounds || 0) * 100), 0),
		[drafts],
	);
	const draftSumValid = draftSumCents === outstandingCents;
	const draftAmounts = useMemo(
		() => drafts.map((d) => Math.round(Number(d.amount_pounds || 0) * 100)),
		[drafts],
	);
	const undersizedIdx = draftAmounts.findIndex((c) => c < STRIPE_MIN_CENTS);
	const hasUndersized = undersizedIdx !== -1;

	function updateDraft(key, patch) {
		setDrafts((cur) => cur.map((d) => (d.key === key ? { ...d, ...patch } : d)));
	}
	function removeDraft(key) {
		setDrafts((cur) => cur.filter((d) => d.key !== key));
	}
	function addDraft() {
		const remaining = Math.max(0, outstandingCents - draftSumCents);
		setDrafts((cur) => [
			...cur,
			newDraft(remaining, cur.length === 0 ? "Deposit" : `Payment ${cur.length + 1}`),
		]);
	}
	function resetDrafts() {
		setDrafts(
			payments
				.filter((p) => !p.paid_at)
				.map((p) => ({
					key: p.id,
					label: p.label,
					amount_pounds: ((p.amount_cents ?? 0) / 100).toFixed(2),
				})),
		);
		setEditing(false);
	}

	async function save() {
		if (!draftSumValid) {
			toast.error(`Payments must sum to ${fmt(outstandingCents)}.`);
			return;
		}
		if (hasUndersized) {
			toast.error(
				`Each split must be at least ${fmt(STRIPE_MIN_CENTS)} (Stripe minimum).`,
			);
			return;
		}
		setBusy("save");
		try {
			await replaceBookingPaymentsAction({
				booking_id: bookingId,
				rows: drafts.map((d) => ({
					label: d.label.trim() || "Payment",
					amount_cents: Math.round(Number(d.amount_pounds || 0) * 100),
				})),
			});
			toast.success("Saved");
			setEditing(false);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't save");
		} finally {
			setBusy(null);
		}
	}

	async function copyLink(token) {
		const base =
			typeof window !== "undefined" ? `${window.location.origin}` : "";
		const url = `${base}/booking/${reference}/pay-installment/${token}`;
		try {
			await navigator.clipboard.writeText(url);
			toast.success("Link copied");
		} catch {
			toast.error("Could not copy — long-press the link manually.");
		}
	}

	async function sendLink(paymentId) {
		setBusy(`send-${paymentId}`);
		try {
			await sendBookingPaymentLinkAction({ booking_payment_id: paymentId });
			toast.success("Link emailed");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't send");
		} finally {
			setBusy(null);
		}
	}

	async function markPaidOffline(paymentId) {
		setBusy(`paid-${paymentId}`);
		try {
			await markBookingPaymentPaidOfflineAction({ booking_payment_id: paymentId });
			toast.success("Marked paid");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't mark paid");
		} finally {
			setBusy(null);
		}
	}

	async function unmarkPaid(paymentId) {
		setBusy(`unpay-${paymentId}`);
		try {
			await unmarkBookingPaymentPaidAction({ booking_payment_id: paymentId });
			toast.success("Reverted");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't revert");
		} finally {
			setBusy(null);
		}
	}

	const noInstallments = payments.length === 0;

	return (
		<section className="rounded-lg border bg-card p-6 space-y-4">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					Payments
				</h2>
				{!editing && outstandingCents > 0 && (
					<button
						type="button"
						className="text-xs text-muted-foreground hover:text-foreground underline"
						onClick={() => setEditing(true)}
					>
						{noInstallments ? "Set splits" : "Edit splits"}
					</button>
				)}
			</div>

			{noInstallments && !editing && (
				<p className="text-sm text-muted-foreground">
					No payment splits yet. The default (deposit + balance) will be created
					automatically when the booking is approved or confirmed.
				</p>
			)}

			{!editing && payments.length > 0 && (
				<ul className="rounded-md border bg-background divide-y divide-foreground/10">
					{payments.map((p) => {
						const isPaid = !!p.paid_at;
						const isSent = !!p.sent_at && !isPaid;
						const percent =
							totalCents > 0 ? Math.round((p.amount_cents / totalCents) * 1000) / 10 : 0;
						return (
							<li key={p.id} className="p-3 space-y-2">
								<div className="flex items-baseline justify-between gap-3 flex-wrap">
									<div className="flex items-baseline gap-2 flex-wrap">
										<span className="text-sm font-medium">{p.label}</span>
										<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
											{percent}%
										</span>
										{isPaid && (
											<span className="text-[10px] uppercase tracking-[0.18em] rounded-full border border-primary/30 bg-primary/10 text-primary px-2 py-0.5">
												paid · {p.paid_via}
											</span>
										)}
										{isSent && (
											<span className="text-[10px] uppercase tracking-[0.18em] rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 px-2 py-0.5">
												sent
											</span>
										)}
									</div>
									<span className="font-mono tabular-nums text-sm">
										{fmt(p.amount_cents)}
									</span>
								</div>
								{isPaid && p.paid_at && (
									<div className="text-[11px] text-muted-foreground">
										{dateFmt.format(new Date(p.paid_at))}
										{p.offline_note ? ` · ${p.offline_note}` : ""}
									</div>
								)}
								{!isPaid && (
									<div className="flex flex-wrap items-center gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={() => copyLink(p.pay_token)}
										>
											Copy link
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => sendLink(p.id)}
											disabled={busy === `send-${p.id}`}
										>
											{busy === `send-${p.id}` ? "Sending…" : "Send link"}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => markPaidOffline(p.id)}
											disabled={busy === `paid-${p.id}`}
										>
											{busy === `paid-${p.id}` ? "…" : "Mark paid (offline)"}
										</Button>
									</div>
								)}
								{isPaid && p.paid_via === "offline" && (
									<div>
										<Button
											size="sm"
											variant="ghost"
											className="text-muted-foreground"
											onClick={() => unmarkPaid(p.id)}
											disabled={busy === `unpay-${p.id}`}
										>
											Undo
										</Button>
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}

			{editing && (
				<div className="space-y-3">
					<p className="text-xs text-muted-foreground">
						Outstanding to allocate:{" "}
						<span className="font-mono text-foreground">{fmt(outstandingCents)}</span>
						{paidSum > 0 && (
							<>
								{" "}
								(paid so far: <span className="font-mono">{fmt(paidSum)}</span>)
							</>
						)}
					</p>
					<ul className="space-y-2">
						{drafts.map((d, i) => {
							const cents = draftAmounts[i] ?? 0;
							const isUndersized = cents > 0 && cents < STRIPE_MIN_CENTS;
							return (
								<li key={d.key} className="space-y-1">
									<div className="grid gap-2 grid-cols-[1fr_120px_auto] items-center">
										<Input
											value={d.label}
											onChange={(e) => updateDraft(d.key, { label: e.target.value })}
											placeholder={`Payment ${i + 1}`}
										/>
										<Input
											type="number"
											step="0.01"
											min={0}
											value={d.amount_pounds}
											onChange={(e) =>
												updateDraft(d.key, { amount_pounds: e.target.value })
											}
											aria-invalid={isUndersized || undefined}
											className={
												isUndersized ? "border-destructive focus-visible:ring-destructive" : ""
											}
										/>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="text-destructive"
											onClick={() => removeDraft(d.key)}
										>
											Remove
										</Button>
									</div>
									{isUndersized && (
										<div className="text-[11px] text-destructive">
											Below Stripe's {fmt(STRIPE_MIN_CENTS)} minimum — won't be chargeable.
										</div>
									)}
								</li>
							);
						})}
					</ul>
					<div className="flex items-center gap-2">
						<Button type="button" variant="outline" size="sm" onClick={addDraft}>
							+ Add payment
						</Button>
						<div
							className={`text-xs ${draftSumValid ? "text-muted-foreground" : "text-destructive"}`}
						>
							Sum: {fmt(draftSumCents)} / {fmt(outstandingCents)}
						</div>
					</div>
					<div className="flex items-center justify-end gap-2">
						<Button type="button" variant="ghost" size="sm" onClick={resetDrafts}>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={save}
							disabled={
								busy === "save" || !draftSumValid || hasUndersized || drafts.length === 0
							}
						>
							{busy === "save" ? "Saving…" : "Save splits"}
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}
