"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { DatePicker } from "@/site/booking/date-picker";
import {
	markTenancyInvoicePaidAction,
	voidTenancyInvoiceAction,
	unmarkTenancyInvoicePaidAction,
} from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtGbp = (c) => gbp.format((c ?? 0) / 100);

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London",
});

const STATUS_STYLES = {
	draft: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	issued: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	paid: "border-primary/30 bg-primary/10 text-primary",
	void: "border-foreground/15 text-muted-foreground",
};

function StatusBadge({ status }) {
	return (
		<span
			className={`text-[10px] uppercase tracking-[0.18em] rounded-full border px-2 py-0.5 ${
				STATUS_STYLES[status] || STATUS_STYLES.void
			}`}
		>
			{status}
		</span>
	);
}

function todayLondon() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/London",
		year: "numeric", month: "2-digit", day: "2-digit",
	}).format(new Date());
}

function dayOfMonthLabel(d) {
	const n = Number(d) || 1;
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export default function InvoicesSection({ invoices, invoiceDayOfMonth }) {
	const router = useRouter();
	const [markingId, setMarkingId] = useState(null);
	const [paidOn, setPaidOn] = useState(todayLondon());
	const [busyId, setBusyId] = useState(null);

	async function confirmMarkPaid(id) {
		setBusyId(id);
		try {
			await markTenancyInvoicePaidAction({ id, paid_on: paidOn });
			toast.success("Invoice marked paid");
			setMarkingId(null);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not mark invoice paid.");
		} finally {
			setBusyId(null);
		}
	}

	async function unmarkPaid(id) {
		setBusyId(id);
		try {
			await unmarkTenancyInvoicePaidAction(id);
			toast.success("Invoice un-marked");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not undo.");
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

	return (
		<section className="space-y-3">
			<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
				Invoices · {invoices.length}
			</h2>
			{invoices.length === 0 ? (
				<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
					No invoices yet. The daily cron will generate one on the{" "}
					{dayOfMonthLabel(invoiceDayOfMonth)} of each month.
				</div>
			) : (
				<ul className="rounded-lg border bg-card divide-y divide-foreground/10 overflow-hidden">
					{invoices.map((inv) => {
						const isMarking = markingId === inv.id;
						const isBusy = busyId === inv.id;
						return (
							<li key={inv.id} className="p-4 space-y-2">
								<div className="flex items-baseline justify-between gap-3 flex-wrap">
									<div className="flex items-baseline gap-2 flex-wrap">
										<div className="text-sm font-medium">
											{monthFmt.format(new Date(`${inv.period_ym}-01T00:00:00Z`))}
										</div>
										<StatusBadge status={inv.status} />
										<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
											{inv.reference}
										</span>
									</div>
									<div className="flex items-center gap-2">
										<span className="text-sm font-mono">{fmtGbp(inv.total_cents)}</span>
									</div>
								</div>

								{inv.status === "paid" && inv.paid_at && (
									<div className="text-xs text-muted-foreground">
										Paid on {dateFmt.format(new Date(inv.paid_at))}
									</div>
								)}

								{!isMarking && (inv.status === "issued" || inv.status === "draft") && (
									<div className="flex items-center gap-2">
										<Button
											size="sm"
											onClick={() => {
												setMarkingId(inv.id);
												setPaidOn(todayLondon());
											}}
										>
											Mark paid
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => voidInvoice(inv.id)}
											disabled={isBusy}
										>
											Void
										</Button>
									</div>
								)}

								{isMarking && (
									<div className="rounded-md border border-foreground/10 bg-muted/30 p-3 flex items-end gap-2 flex-wrap">
										<div className="space-y-1">
											<label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
												Paid on
											</label>
											<DatePicker value={paidOn} onChange={setPaidOn} />
										</div>
										<Button
											size="sm"
											onClick={() => confirmMarkPaid(inv.id)}
											disabled={isBusy || !paidOn}
										>
											{isBusy ? "Saving…" : "Confirm"}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setMarkingId(null)}
											disabled={isBusy}
										>
											Cancel
										</Button>
									</div>
								)}

								{inv.status === "paid" && (
									<div>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => unmarkPaid(inv.id)}
											disabled={isBusy}
										>
											{isBusy ? "Working…" : "Undo mark paid"}
										</Button>
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
