"use client";

import Link from "next/link";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

const stampFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

function statusClass(status) {
	switch (status) {
		case "pending":
			return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
		case "paid":
			return "border-primary/30 bg-primary/10 text-primary";
		case "cancelled":
		case "refunded":
		case "partially_refunded":
			return "border-destructive/30 bg-destructive/10 text-destructive";
		default:
			return "border-foreground/15 bg-muted text-muted-foreground";
	}
}

function summarise(orders) {
	const t = {
		paid_count: 0,
		gross: 0,
		organiser_net: 0,
		fees: 0,
		stripe: 0,
		venue_profit: 0,
	};
	for (const o of orders) {
		if (o.status !== "paid" && o.status !== "partially_refunded") continue;
		const stripe = o.stripe_fee_actual_cents ?? o.stripe_fee_estimate_cents ?? 0;
		t.paid_count += 1;
		t.gross += o.total_cents ?? 0;
		t.organiser_net += o.organiser_net_cents ?? 0;
		t.fees += o.booking_fee_cents ?? 0;
		t.stripe += stripe;
		t.venue_profit += (o.booking_fee_cents ?? 0) - stripe;
	}
	return t;
}

export default function OrdersTab({ eventId, orders = [] }) {
	const totals = summarise(orders);
	return (
		<div className="space-y-4">
			{orders.length > 0 && (
				<div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
					<Stat label="Paid orders" value={String(totals.paid_count)} />
					<Stat label="Customer total" value={formatGbp(totals.gross)} />
					<Stat label="Organiser net" value={formatGbp(totals.organiser_net)} />
					<Stat label="Stripe fees" value={formatGbp(totals.stripe)} muted />
					<Stat
						label="Venue profit"
						value={formatGbp(totals.venue_profit)}
						tone={totals.venue_profit >= 0 ? "primary" : "destructive"}
					/>
				</div>
			)}
			<div className="rounded-lg border bg-card overflow-x-auto">
				{orders.length === 0 ? (
					<p className="p-6 text-sm text-muted-foreground">No orders yet.</p>
				) : (
					<table className="w-full text-sm min-w-205">
						<thead className="bg-muted/40 text-xs uppercase tracking-[0.18em] text-muted-foreground">
							<tr>
								<th className="text-left font-normal px-4 py-3">Reference</th>
								<th className="text-left font-normal px-4 py-3">Buyer</th>
								<th className="text-left font-normal px-4 py-3">When</th>
								<th className="text-right font-normal px-4 py-3">Delegates</th>
								<th className="text-right font-normal px-4 py-3">Total</th>
								<th className="text-right font-normal px-4 py-3">Organiser net</th>
								<th
									className="text-right font-normal px-4 py-3"
									title="Booking fee − Stripe fee. Stripe figure is the estimate until the webhook fires."
								>
									Venue profit
								</th>
								<th className="text-left font-normal px-4 py-3">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-foreground/10">
							{orders.map((o) => {
								const stripe = o.stripe_fee_actual_cents ?? o.stripe_fee_estimate_cents ?? 0;
								const isPaid = o.status === "paid" || o.status === "partially_refunded";
								const venueProfit = isPaid ? (o.booking_fee_cents ?? 0) - stripe : null;
								return (
									<tr key={o.id} className="hover:bg-muted/30">
										<td className="px-4 py-3 font-mono text-xs">
											<Link
												href={`/admin/events/${eventId}/orders/${o.id}`}
												className="hover:underline"
											>
												{o.reference}
											</Link>
										</td>
										<td className="px-4 py-3">
											<div>
												{o.customer_first_name} {o.customer_last_name}
											</div>
											<div className="text-xs text-muted-foreground">{o.customer_email}</div>
										</td>
										<td className="px-4 py-3 text-muted-foreground">
											{stampFmt.format(new Date(o.createdAt))}
										</td>
										<td className="px-4 py-3 text-right font-mono">
											{o.delegate_count ?? 0}
										</td>
										<td className="px-4 py-3 text-right font-mono">
											{formatGbp(o.total_cents)}
										</td>
										<td className="px-4 py-3 text-right font-mono text-muted-foreground">
											{isPaid ? formatGbp(o.organiser_net_cents) : "-"}
										</td>
										<td
											className={`px-4 py-3 text-right font-mono ${
												venueProfit == null
													? "text-muted-foreground"
													: venueProfit >= 0
														? "text-primary"
														: "text-destructive"
											}`}
										>
											{venueProfit == null ? "-" : formatGbp(venueProfit)}
										</td>
										<td className="px-4 py-3">
											<span
												className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs capitalize ${statusClass(o.status)}`}
											>
												{o.status.replace("_", " ")}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}

function Stat({ label, value, tone, muted }) {
	const cls =
		tone === "primary"
			? "border-primary/30 bg-primary/5"
			: tone === "destructive"
				? "border-destructive/30 bg-destructive/5"
				: "border-foreground/10 bg-background";
	return (
		<div className={`rounded-md border p-3 ${cls}`}>
			<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
				{label}
			</div>
			<div
				className={`mt-1 font-mono ${muted ? "text-muted-foreground" : ""}`}
			>
				{value}
			</div>
		</div>
	);
}
