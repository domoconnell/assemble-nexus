"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shadcn/components/ui/button";
import { ScrollArea, ScrollBar } from "@/shadcn/components/ui/scroll-area";
import { generateSessionDates } from "@/lib/tenancies/schedule.js";
import { computeInvoiceForMonth } from "@/lib/tenancies/billing.js";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const monthFmt = new Intl.DateTimeFormat("en-GB", {
	month: "long",
	year: "numeric",
	timeZone: "Europe/London",
});

function startOfUtcMonth(year, monthIdx0) {
	return new Date(Date.UTC(year, monthIdx0, 1, 0, 0, 0));
}

function endOfUtcMonth(year, monthIdx0) {
	// Inclusive end: 23:59:59 on the last day. The schedule engine
	// expects `until` as a Date.
	return new Date(Date.UTC(year, monthIdx0 + 1, 0, 23, 59, 59));
}

function todayLondonYmd() {
	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/London",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	return fmt.format(new Date());
}

/**
 * Live preview of what next month's (or any selected month's) invoice
 * looks like based on the in-flight form state. Re-uses the same engine
 * + billing math the server cron will use, so what you see here matches
 * what'll actually get issued.
 *
 * `lines` is the form's `lines` state in the same shape the server
 * action expects. `rooms` provides id→name+is_public for nicer labels.
 */
export default function InvoicePreview({
	tenancyStartsOn,
	tenancyEndsOn,
	monthlyOverrideCents,
	lines,
	rooms,
	roomRackRates = {},
}) {
	// Default to the month containing `starts_on`, or this London month
	// if the start is in the past / not set yet.
	const initialMonth = useMemo(() => {
		const candidate = tenancyStartsOn || todayLondonYmd();
		const [y, m] = candidate.split("-").map(Number);
		if (!y || !m) {
			const now = new Date();
			return { year: now.getUTCFullYear(), monthIdx0: now.getUTCMonth() };
		}
		return { year: y, monthIdx0: m - 1 };
	}, [tenancyStartsOn]);

	const [cursor, setCursor] = useState(initialMonth);

	const roomLookup = useMemo(() => {
		return new Map(rooms.map((r) => [r.id, r]));
	}, [rooms]);

	function step(delta) {
		setCursor((c) => {
			const next = startOfUtcMonth(c.year, c.monthIdx0 + delta);
			return { year: next.getUTCFullYear(), monthIdx0: next.getUTCMonth() };
		});
	}

	const monthStart = startOfUtcMonth(cursor.year, cursor.monthIdx0);
	const monthEnd = endOfUtcMonth(cursor.year, cursor.monthIdx0);

	// Build a fake set of sessions per line by running the same engine
	// the cron uses. Engine expects line objects with room_name; we
	// enrich here so descriptions render nicely.
	const enrichedLines = useMemo(() => {
		return (lines ?? []).map((l) => {
			const room = roomLookup.get(l.room_id);
			return { ...l, id: l._id, room_name: room?.name ?? "(no room)" };
		});
	}, [lines, roomLookup]);

	const sessionsByLine = useMemo(() => {
		const map = new Map();
		if (!tenancyStartsOn) return map;
		const dates = {
			starts_on: tenancyStartsOn,
			ends_on: tenancyEndsOn || null,
		};
		for (const line of enrichedLines) {
			if (line.kind !== "scheduled") continue;
			try {
				const occs = generateSessionDates(line, dates, {
					from: monthStart,
					until: monthEnd,
				});
				map.set(line.id, occs);
			} catch {
				map.set(line.id, []);
			}
		}
		return map;
	}, [enrichedLines, tenancyStartsOn, tenancyEndsOn, monthStart, monthEnd]);

	const computed = computeInvoiceForMonth({
		tenancy: { monthly_override_cents: monthlyOverrideCents },
		lines: enrichedLines,
		sessionsByLine,
		rackRatesByRoomId: roomRackRates,
	});

	const hasLines = (lines ?? []).length > 0;

	return (
		<section className="rounded-lg border bg-card p-6 space-y-4">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div>
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Invoice preview
					</h2>
					<p className="text-[11px] text-muted-foreground mt-1 max-w-md">
						Same math the monthly cron will run. Scroll months to see how
						scheduled-line amounts shift across 4-week vs 5-week months.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => step(-1)}
					>
						←
					</Button>
					<span className="text-sm font-medium min-w-32 text-center">
						{monthFmt.format(monthStart)}
					</span>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => step(1)}
					>
						→
					</Button>
				</div>
			</div>

			{!hasLines ? (
				<div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
					Add at least one line above to see the preview.
				</div>
			) : (
				<InvoiceTable computed={computed} />
			)}
		</section>
	);
}

/**
 * Render the invoice as a table:
 *   Room | Rate basis | Rate | Quantity | Standard Rate Subtotal |
 *     Override | Reduced Subtotal | Reduction
 *
 * Followed by a totals area aligned to the right that shows:
 *   Standard Rate Total, Reduced Total, Fixed Fee Adjustment, Grand Total,
 *   Total Reduction.
 *
 * Sign convention on the bottom block:
 *   - "Fixed Fee Adjustment" = Reduced Total − Grand Total. Positive value
 *     means the override delivered more reduction; negative means the
 *     override raised the bill above the line-billed total.
 *   - "Total Reduction" = Standard Rate Total − Grand Total. The
 *     customer's overall saving vs the venue's standard hire rate.
 */
function InvoiceTable({ computed }) {
	const lines = computed.lines ?? [];
	const standardRateTotal = computed.rack_subtotal_cents ?? 0;
	const reducedTotal = computed.subtotal_cents ?? 0;
	const grandTotal = computed.billed_cents ?? 0;
	const fixedFeeAdjustment = reducedTotal - grandTotal;
	const totalReduction = standardRateTotal - grandTotal;

	const hasFixedFeeAdjustment = computed.uncapped_subtotal_cents != null;
	const hasReduction = totalReduction !== 0;

	// Collapse the Override/Reduced/Reduction columns when no line actually
	// has a reduction (no override applied anywhere) — then "Standard rate
	// subtotal" is just "Subtotal".
	const anyLineReduced = lines.some((l) => (l.reduction_cents ?? 0) !== 0);
	const showReductionColumns = anyLineReduced;

	// Number of columns to the LEFT of the value column the totals
	// terminate in. Use this for the colspan on the "label" cell in the
	// footer so the totals line up under the right-most value column.
	const valueColIndex = showReductionColumns ? 6 : 4; // 0-based
	const labelColspan = valueColIndex; // cells preceding the value
	const trailingCols = showReductionColumns ? 1 : 0; // cells after the value

	return (
		<div className="rounded-md border bg-background">
			<ScrollArea className="w-full">
				<table className="w-full text-sm">
					<thead className="border-b border-foreground/10 bg-muted/30 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						<tr>
							<th className="text-left px-3 py-2 font-medium">Room</th>
							<th className="text-left px-3 py-2 font-medium">Rate basis</th>
							<th className="text-right px-3 py-2 font-medium">Rate</th>
							<th className="text-right px-3 py-2 font-medium">Quantity</th>
							<th className="text-right px-3 py-2 font-medium whitespace-nowrap">
								{showReductionColumns ? "Standard rate subtotal" : "Subtotal"}
							</th>
							{showReductionColumns && (
								<>
									<th className="text-left px-3 py-2 font-medium">Override</th>
									<th className="text-right px-3 py-2 font-medium whitespace-nowrap">
										Reduced subtotal
									</th>
									<th className="text-right px-3 py-2 font-medium">Reduction</th>
								</>
							)}
						</tr>
					</thead>
					<tbody className="divide-y divide-foreground/10">
						{lines.map((l) => (
							<tr key={l.tenancy_line_id} className="align-top">
								<td className="px-3 py-2 whitespace-nowrap">{l.room_name || "—"}</td>
								<td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
									{l.rate_basis || "—"}
								</td>
								<td className="px-3 py-2 text-right font-mono tabular-nums">
									{fmt(l.rate_cents)}
								</td>
								<td className="px-3 py-2 text-right text-muted-foreground tabular-nums whitespace-nowrap">
									{l.quantity_label || "—"}
								</td>
								<td className="px-3 py-2 text-right font-mono tabular-nums">
									{fmt(l.standard_rate_subtotal_cents)}
								</td>
								{showReductionColumns && (
									<>
										<td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
											{l.override_description || ""}
										</td>
										<td className="px-3 py-2 text-right font-mono tabular-nums">
											{fmt(l.reduced_subtotal_cents)}
										</td>
										<td
											className={`px-3 py-2 text-right font-mono tabular-nums ${
												l.reduction_cents > 0
													? "text-primary"
													: l.reduction_cents < 0
														? "text-destructive"
														: "text-muted-foreground"
											}`}
										>
											{l.reduction_cents === 0
												? "—"
												: `${l.reduction_cents > 0 ? "−" : "+"}${fmt(Math.abs(l.reduction_cents))}`}
										</td>
									</>
								)}
							</tr>
						))}
						{/* Totals rows live inside the same tbody so the divide-y
						    border keeps applying — putting them in a <tfoot>
						    introduced a visible gap between the last line item
						    and the Standard rate total row. The bg tint moves
						    onto each totals row instead. */}
						{showReductionColumns ? (
							<>
								<tr>
									<td colSpan={3} />
									<td className="px-3 py-2 text-right font-medium text-muted-foreground">
										Standard rate total
									</td>
									<td className="px-3 py-2 text-right font-mono tabular-nums font-medium">
										{fmt(standardRateTotal)}
									</td>
									<td className="px-3 py-2 text-right font-medium text-muted-foreground">
										Reduced total
									</td>
									<td className="px-3 py-2 text-right font-mono tabular-nums font-medium">
										{fmt(reducedTotal)}
									</td>
									<td />
								</tr>
								{hasFixedFeeAdjustment && (
									<tr>
										<td colSpan={5} />
										<td className="px-3 py-2 text-right text-muted-foreground">
											Fixed fee adjustment
										</td>
										<td
											className={`px-3 py-2 text-right font-mono tabular-nums ${fixedFeeAdjustment > 0 ? "text-primary" : fixedFeeAdjustment < 0 ? "text-destructive" : ""}`}
										>
											{fixedFeeAdjustment > 0 ? "−" : "+"}
											{fmt(Math.abs(fixedFeeAdjustment))}
										</td>
										<td />
									</tr>
								)}
								<tr className="bg-muted/30">
									<td colSpan={5} />
									<td className="px-3 py-2 text-right font-semibold">Grand total</td>
									<td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
										{fmt(grandTotal)}
									</td>
									<td />
								</tr>
								{hasReduction && (
									<tr>
										<td colSpan={5} />
										<td className="px-3 py-2 text-right text-muted-foreground font-medium">
											Total reduction
										</td>
										<td
											className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${totalReduction > 0 ? "text-primary" : "text-destructive"}`}
										>
											{totalReduction > 0 ? "−" : "+"}
											{fmt(Math.abs(totalReduction))}
										</td>
										<td />
									</tr>
								)}
							</>
						) : (
							<>
								{hasFixedFeeAdjustment && (
									<>
										<tr>
											<td colSpan={4} className="px-3 py-2 text-right text-muted-foreground">
												Subtotal
											</td>
											<td className="px-3 py-2 text-right font-mono tabular-nums">
												{fmt(reducedTotal)}
											</td>
										</tr>
										<tr>
											<td colSpan={4} className="px-3 py-2 text-right text-muted-foreground">
												Fixed fee adjustment
											</td>
											<td
												className={`px-3 py-2 text-right font-mono tabular-nums ${fixedFeeAdjustment > 0 ? "text-primary" : fixedFeeAdjustment < 0 ? "text-destructive" : ""}`}
											>
												{fixedFeeAdjustment > 0 ? "−" : "+"}
												{fmt(Math.abs(fixedFeeAdjustment))}
											</td>
										</tr>
									</>
								)}
								<tr className="bg-muted/30">
									<td colSpan={4} className="px-3 py-2 text-right font-semibold">
										Grand total
									</td>
									<td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
										{fmt(grandTotal)}
									</td>
								</tr>
								{hasReduction && (
									<tr>
										<td colSpan={4} className="px-3 py-2 text-right text-muted-foreground font-medium">
											Total reduction
										</td>
										<td
											className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${totalReduction > 0 ? "text-primary" : "text-destructive"}`}
										>
											{totalReduction > 0 ? "−" : "+"}
											{fmt(Math.abs(totalReduction))}
										</td>
									</tr>
								)}
							</>
						)}
					</tbody>
				</table>
				<ScrollBar orientation="horizontal" />
			</ScrollArea>
		</div>
	);
}
