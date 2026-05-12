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

export default function OrdersTab({ eventId, orders = [] }) {
	return (
		<div className="rounded-lg border bg-card overflow-hidden">
			{orders.length === 0 ? (
				<p className="p-6 text-sm text-muted-foreground">No orders yet.</p>
			) : (
				<table className="w-full text-sm">
					<thead className="bg-muted/40 text-xs uppercase tracking-[0.18em] text-muted-foreground">
						<tr>
							<th className="text-left font-normal px-4 py-3">Reference</th>
							<th className="text-left font-normal px-4 py-3">Buyer</th>
							<th className="text-left font-normal px-4 py-3">When</th>
							<th className="text-right font-normal px-4 py-3">Delegates</th>
							<th className="text-right font-normal px-4 py-3">Total</th>
							<th className="text-left font-normal px-4 py-3">Status</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-foreground/10">
						{orders.map((o) => (
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
								<td className="px-4 py-3">
									<span
										className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs capitalize ${statusClass(o.status)}`}
									>
										{o.status.replace("_", " ")}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
