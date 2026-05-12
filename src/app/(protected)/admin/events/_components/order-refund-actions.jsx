"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import { refundTicketOrderAction } from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

export default function OrderRefundActions({ order }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);

	async function performRefund() {
		setBusy(true);
		setError(null);
		try {
			await refundTicketOrderAction({ order_id: order.id });
			router.refresh();
		} catch (err) {
			setError(err?.message || "Refund failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-3">
			<h2 className="text-xs uppercase tracking-[0.22em] text-destructive">Refund</h2>
			{error && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{error}
				</div>
			)}
			<p className="text-xs text-foreground/85">
				Refunds {formatGbp(order.total_cents)} via the active payment provider and voids the tickets.
			</p>
			<Button
				variant="outline"
				className="w-full"
				onClick={() => setOpen(true)}
				disabled={busy}
			>
				{busy ? "Refunding…" : "Refund order"}
			</Button>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title="Refund this order?"
				description={`Refunds ${formatGbp(order.total_cents)} via the active payment provider and voids the tickets. This can't be undone.`}
				confirmLabel="Refund order"
				destructive
				onConfirm={performRefund}
			/>
		</section>
	);
}
