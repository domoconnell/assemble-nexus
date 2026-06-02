"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { chargeTenancyInvoiceAction } from "../../../tenancies/actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtGbp = (c) => gbp.format((c ?? 0) / 100);

const monthFmt = new Intl.DateTimeFormat("en-GB", {
	month: "long",
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

export default function OrganisationInvoices({ invoices, ddReady }) {
	const router = useRouter();
	const [busyId, setBusyId] = useState(null);

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

	if (invoices.length === 0) {
		return (
			<div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
				No tenancy invoices yet.
			</div>
		);
	}

	return (
		<ul className="rounded-lg border bg-card divide-y divide-foreground/10 overflow-hidden">
			{invoices.map((inv) => {
				const canCharge =
					ddReady &&
					inv.status !== "paid" &&
					inv.status !== "void" &&
					!["pending", "processing", "succeeded"].includes(inv.dd_charge_status ?? "");
				const isBusy = busyId === inv.id;
				return (
					<li key={inv.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
						<div className="min-w-0 space-y-1">
							<div className="flex items-baseline gap-2 flex-wrap">
								<Link
									href={`/admin/tenancies/${inv.tenancy_id}`}
									className="text-sm font-medium hover:text-primary"
								>
									{monthFmt.format(new Date(`${inv.period_ym}-01T00:00:00Z`))}
								</Link>
								<StatusBadge status={inv.status} />
								<DdChargeBadge status={inv.dd_charge_status} />
							</div>
							<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
								{inv.reference}
								{inv.tenancy_label ? ` · ${inv.tenancy_label}` : ""}
							</div>
						</div>
						<div className="flex items-center gap-3 flex-wrap">
							<a
								href={`/api/admin/tenancy-invoices/${inv.id}/pdf`}
								target="_blank"
								rel="noreferrer"
								className="text-xs text-primary hover:underline"
							>
								Download PDF →
							</a>
							{canCharge && (
								<Button
									size="sm"
									variant="outline"
									onClick={() => takeByDirectDebit(inv.id)}
									disabled={isBusy}
								>
									{isBusy ? "Submitting…" : "Take by direct debit"}
								</Button>
							)}
							<span className="text-sm font-mono tabular-nums">
								{fmtGbp(inv.total_cents)}
							</span>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
