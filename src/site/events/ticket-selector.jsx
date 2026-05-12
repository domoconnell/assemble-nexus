"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Checkbox } from "@/shadcn/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shadcn/components/ui/dialog";
import BuyerIdentity, {
	EMPTY_BUYER_IDENTITY,
	buyerIdentityComplete,
	buildBuyerIdentityPayload,
} from "./buyer-identity";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

function buildAllowedAddonsByType(addons, typeAddonLinks) {
	const allowed = new Map();
	for (const link of typeAddonLinks) {
		if (!allowed.has(link.ticket_type_id)) allowed.set(link.ticket_type_id, new Set());
		allowed.get(link.ticket_type_id).add(link.addon_id);
	}
	const byType = new Map();
	for (const [typeId, addonIds] of allowed.entries()) {
		byType.set(
			typeId,
			addons.filter((a) => addonIds.has(a.id)),
		);
	}
	return byType;
}

function groupAddons(addonsForType) {
	const groups = new Map();
	const ungrouped = [];
	for (const a of addonsForType) {
		if (a.group_id) {
			if (!groups.has(a.group_id)) {
				groups.set(a.group_id, {
					id: a.group_id,
					label: a.group_label ?? "Choose one",
					sort_order: a.group_sort_order ?? 0,
					items: [],
				});
			}
			groups.get(a.group_id).items.push(a);
		} else {
			ungrouped.push(a);
		}
	}
	const orderedGroups = [...groups.values()].sort((a, b) => a.sort_order - b.sort_order);
	return { groups: orderedGroups, ungrouped };
}

function deepEq(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

export default function TicketSelector({
	eventId,
	ticketTypes = [],
	addons = [],
	typeAddonLinks = [],
	bundles = [],
	discounts = [],
}) {
	const allowedByType = useMemo(
		() => buildAllowedAddonsByType(addons, typeAddonLinks),
		[addons, typeAddonLinks],
	);

	const hasAnyAddons = addons.length > 0;
	const hasAnyBundles = bundles.length > 0;
	const hasCodeDiscount = discounts.some((d) => d.trigger === "code");

	const [selection, setSelection] = useState(() => {
		const init = {};
		for (const tt of ticketTypes) {
			init[tt.id] = { quantity: 0, addons: {} };
		}
		return init;
	});

	const [codes, setCodes] = useState([]);
	const [codeInput, setCodeInput] = useState("");
	const [showCodeInput, setShowCodeInput] = useState(false);

	const router = useRouter();
	const [quote, setQuote] = useState(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	const [quoteError, setQuoteError] = useState(null);
	const [coverFee, setCoverFee] = useState(false);
	const [checkoutOpen, setCheckoutOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState(null);
	const [identity, setIdentity] = useState(EMPTY_BUYER_IDENTITY);
	const buyerValid = buyerIdentityComplete(identity);

	async function submitOrder() {
		setSubmitting(true);
		setSubmitError(null);
		try {
			const res = await fetch("/api/ticket-orders", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					event_id: eventId,
					cart: cartShape,
					codes,
					customer_covers_fee: coverFee,
					identity: buildBuyerIdentityPayload(identity),
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				setSubmitError(data?.error || "Could not start checkout.");
				return;
			}
			router.push(`/orders/${data.reference}/pay`);
		} catch (err) {
			setSubmitError(err?.message || "Could not start checkout.");
		} finally {
			setSubmitting(false);
		}
	}

	// Live quote
	const cartShape = useMemo(() => {
		const tickets = ticketTypes
			.filter((tt) => (selection[tt.id]?.quantity ?? 0) > 0)
			.map((tt) => ({
				ticket_type_id: tt.id,
				quantity: selection[tt.id].quantity,
				addons: Object.entries(selection[tt.id].addons ?? {})
					.filter(([, qty]) => qty > 0)
					.map(([addon_id, qty]) => ({ addon_id, quantity: qty })),
			}));
		return { tickets };
	}, [selection, ticketTypes]);

	useEffect(() => {
		if (cartShape.tickets.length === 0) {
			setQuote(null);
			return;
		}
		const controller = new AbortController();
		const handle = setTimeout(async () => {
			setQuoteLoading(true);
			setQuoteError(null);
			try {
				const res = await fetch("/api/ticket-orders/quote", {
					method: "POST",
					signal: controller.signal,
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						event_id: eventId,
						cart: cartShape,
						codes,
						customer_covers_fee: coverFee,
					}),
				});
				const data = await res.json();
				if (res.ok) setQuote(data);
				else {
					setQuote(null);
					setQuoteError(data?.error || "Could not price this selection.");
				}
			} catch (err) {
				if (err?.name !== "AbortError") {
					setQuote(null);
					setQuoteError("Could not price this selection.");
				}
			} finally {
				setQuoteLoading(false);
			}
		}, 300);
		return () => {
			controller.abort();
			clearTimeout(handle);
		};
	}, [cartShape, codes, eventId, coverFee]);

	function setQty(typeId, qty) {
		setSelection((s) => {
			const next = { ...s };
			const newQty = Math.max(0, qty);
			const cur = next[typeId] ?? { quantity: 0, addons: {} };
			// Clamp addon counts so they can't exceed the new ticket qty for this line.
			// (The server caps at qty × max_per_ticket, but the simple newQty cap is
			// good enough at the UI layer and rare to hit for quantifiable addons.)
			const clamped = {};
			for (const [aid, count] of Object.entries(cur.addons ?? {})) {
				const c = Math.min(count, newQty);
				if (c > 0) clamped[aid] = c;
			}
			next[typeId] = { quantity: newQty, addons: clamped };
			return next;
		});
	}

	function setAddonQty(typeId, addonId, qty) {
		setSelection((s) => {
			const next = { ...s };
			const cur = next[typeId] ?? { quantity: 0, addons: {} };
			const addons = { ...(cur.addons ?? {}) };
			if (!qty || qty <= 0) delete addons[addonId];
			else addons[addonId] = qty;
			next[typeId] = { ...cur, addons };
			return next;
		});
	}

	function clearAddonGroup(typeId, groupItems) {
		setSelection((s) => {
			const next = { ...s };
			const cur = next[typeId] ?? { quantity: 0, addons: {} };
			const addons = { ...(cur.addons ?? {}) };
			for (const g of groupItems) delete addons[g.id];
			next[typeId] = { ...cur, addons };
			return next;
		});
	}

	function applyCode() {
		const trimmed = codeInput.trim().toUpperCase();
		if (!trimmed) return;
		if (codes.includes(trimmed)) return;
		setCodes((cs) => [...cs, trimmed]);
		setCodeInput("");
	}
	function removeCode(c) {
		setCodes((cs) => cs.filter((x) => x !== c));
	}

	const totalSelected = ticketTypes.reduce(
		(s, tt) => s + (selection[tt.id]?.quantity ?? 0),
		0,
	);
	const occupancy = quote?.occupancy;
	const overCapacity = !!occupancy?.over_capacity;
	const canBuy = totalSelected > 0 && quote && !overCapacity && !quoteLoading;

	if (ticketTypes.length === 0) {
		return (
			<div className="rounded-xl border border-foreground/10 bg-card p-6 text-sm text-muted-foreground">
				No tickets on sale.
			</div>
		);
	}

	return (
		<div className="rounded-xl border border-foreground/10 bg-card p-6 space-y-6">
			<div>
				<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">Tickets</h2>
			</div>

			{hasAnyBundles && (
				<div className="space-y-2">
					<p className="text-xs text-muted-foreground">
						Bundles available — buy these combinations together to save.
					</p>
					<div className="grid gap-2">
						{bundles.map((b) => (
							<div
								key={b.id}
								className="rounded-md border border-foreground/10 bg-background p-3 text-sm"
							>
								<div className="flex items-baseline justify-between gap-3">
									<span className="font-medium">{b.name}</span>
									<span className="font-mono">{formatGbp(b.total_price_cents)}</span>
								</div>
								<div className="text-xs text-muted-foreground mt-0.5">
									{(b.items ?? [])
										.map((it) => {
											const tt = ticketTypes.find((t) => t.id === it.ticket_type_id);
											return `${it.quantity} × ${tt?.name ?? "?"}`;
										})
										.join(" + ")}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			<div className="space-y-3">
				{ticketTypes.map((tt) => {
					const sel = selection[tt.id] ?? { quantity: 0, addons: {} };
					const qty = sel.quantity;
					const addonsForType = allowedByType.get(tt.id) ?? [];
					const expanded = qty > 0 && addonsForType.length > 0;
					return (
						<div
							key={tt.id}
							className={`rounded-md border p-4 transition ${
								qty > 0
									? "border-primary/30 bg-primary/5"
									: "border-foreground/10 bg-background"
							}`}
						>
							<div className="flex items-start justify-between gap-4">
								<div className="min-w-0">
									<div className="font-medium">{tt.name}</div>
									{tt.description && (
										<div className="text-sm text-muted-foreground mt-0.5">
											{tt.description}
										</div>
									)}
									{tt.admits_count > 1 && (
										<div className="text-xs text-muted-foreground mt-1">
											Admits {tt.admits_count}
										</div>
									)}
								</div>
								<div className="text-right shrink-0">
									<div className="font-mono text-sm">{formatGbp(tt.price_cents)}</div>
								</div>
							</div>
							<div className="mt-3 flex items-center justify-between gap-3">
								<div className="text-xs text-muted-foreground">
									{tt.max_quantity != null && `Limited · ${tt.max_quantity} max`}
								</div>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setQty(tt.id, qty - 1)}
										disabled={qty === 0}
										aria-label="Decrease"
									>
										−
									</Button>
									<span className="w-8 text-center font-mono text-sm">{qty}</span>
									<Button
										variant="outline"
										size="sm"
										onClick={() => setQty(tt.id, qty + 1)}
										aria-label="Increase"
									>
										+
									</Button>
								</div>
							</div>

							{expanded && (
								<div className="mt-4 pt-4 border-t border-foreground/10 space-y-3">
									<AddonsBlock
										ticketQuantity={qty}
										addons={addonsForType}
										selection={sel.addons ?? {}}
										onSetQty={(addonId, q) => setAddonQty(tt.id, addonId, q)}
										onClearGroup={(groupItems) => clearAddonGroup(tt.id, groupItems)}
									/>
								</div>
							)}
						</div>
					);
				})}
			</div>

			{hasCodeDiscount && (
				<div className="space-y-2">
					{!showCodeInput ? (
						<button
							type="button"
							onClick={() => setShowCodeInput(true)}
							className="text-xs text-muted-foreground hover:text-foreground underline"
						>
							Have a code?
						</button>
					) : (
						<div className="space-y-2">
							<Label className="text-xs">Discount code</Label>
							<div className="flex gap-2">
								<Input
									value={codeInput}
									onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
									placeholder="CODE"
									className="font-mono"
								/>
								<Button type="button" variant="outline" size="sm" onClick={applyCode}>
									Apply
								</Button>
							</div>
							{codes.length > 0 && (
								<div className="flex flex-wrap gap-2">
									{codes.map((c) => (
										<span
											key={c}
											className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-muted px-2 py-0.5 text-xs"
										>
											{c}
											<button
												type="button"
												onClick={() => removeCode(c)}
												className="text-muted-foreground hover:text-foreground"
												aria-label={`Remove ${c}`}
											>
												×
											</button>
										</span>
									))}
								</div>
							)}
						</div>
					)}
				</div>
			)}

			<div className="border-t border-foreground/10 pt-4 space-y-2 text-sm">
				{quoteError && (
					<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
						{quoteError}
					</div>
				)}

				{quote && (
					<>
						{(quote.bundles_applied ?? []).length > 0 && (
							<div className="space-y-1">
								{quote.bundles_applied.map((b, i) => (
									<div key={i} className="flex items-baseline justify-between gap-3 text-xs text-primary">
										<span>Bundle: {b.name}</span>
										<span>Applied</span>
									</div>
								))}
							</div>
						)}

						{(quote.lines ?? [])
							.filter((l) => l.kind === "discount")
							.map((l, i) => (
								<div key={i} className="flex items-baseline justify-between gap-3 text-primary">
									<span className="truncate">{l.name_snapshot}</span>
									<span className="font-mono">{formatGbp(l.line_total_cents)}</span>
								</div>
							))}

						<div className="flex items-baseline justify-between gap-3">
							<span className="text-muted-foreground">Subtotal</span>
							<span className="font-mono">{formatGbp(quote.subtotal_cents)}</span>
						</div>
						{quote.vat_cents > 0 && (
							<div className="flex items-baseline justify-between gap-3">
								<span className="text-muted-foreground">VAT</span>
								<span className="font-mono">{formatGbp(quote.vat_cents)}</span>
							</div>
						)}

						{quote.booking_fee?.cents > 0 && quote.booking_fee.borne_by === "customer" && (
							<div className="flex items-baseline justify-between gap-3">
								<span className="text-muted-foreground">Booking fee</span>
								<span className="font-mono">{formatGbp(quote.booking_fee.cents)}</span>
							</div>
						)}

						<div className="flex items-baseline justify-between gap-3 pt-2 border-t border-foreground/10">
							<span className="font-medium">Total</span>
							<span className="font-display text-2xl">
								{formatGbp(quote.customer_total_cents ?? quote.total_cents)}
							</span>
						</div>

						{quote.booking_fee?.allow_customer_optin &&
							(quote.booking_fee.fee_if_customer_pays_cents > 0 ||
								quote.booking_fee.fee_if_organiser_pays_cents > 0) && (
								<FeeOptIn
									organiserName={quote.organiser?.name ?? null}
									feeIfCustomerPaysCents={quote.booking_fee.fee_if_customer_pays_cents}
									feeIfOrganiserPaysCents={quote.booking_fee.fee_if_organiser_pays_cents}
									orderValueCents={quote.total_cents}
									borneByCustomer={quote.booking_fee.borne_by === "customer"}
									onChange={setCoverFee}
									coverFee={coverFee}
								/>
							)}

						{overCapacity && (
							<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
								This event is at capacity. The selected tickets would put it over the
								{occupancy.max != null && ` ${occupancy.max}-person`} limit
								{occupancy.available != null && ` (${occupancy.available} place${occupancy.available === 1 ? "" : "s"} left).`}.
							</div>
						)}
						{!overCapacity && occupancy?.available != null && occupancy.available <= 10 && occupancy.available > 0 && (
							<div className="text-xs text-muted-foreground">
								Only {occupancy.available} place{occupancy.available === 1 ? "" : "s"} left.
							</div>
						)}
					</>
				)}

				{quoteLoading && (
					<p className="text-xs text-muted-foreground">Updating…</p>
				)}
			</div>

			<Button
				className="w-full"
				size="lg"
				disabled={!canBuy}
				onClick={() => setCheckoutOpen(true)}
			>
				Continue to checkout
			</Button>

			<Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
				<DialogContent className="max-w-md p-6 sm:p-8 space-y-6">
					<DialogHeader>
						<DialogTitle>Who&apos;s buying?</DialogTitle>
						<DialogDescription>
							Tickets are emailed to this address — and you&apos;ll be signed in
							so you can come back any time to see them.
						</DialogDescription>
					</DialogHeader>
					{submitError && (
						<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
							{submitError}
						</div>
					)}
					<BuyerIdentity value={identity} onChange={setIdentity} />
					<div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-foreground/10">
						<Button
							variant="outline"
							onClick={() => setCheckoutOpen(false)}
							disabled={submitting}
						>
							Cancel
						</Button>
						<Button onClick={submitOrder} disabled={!buyerValid || submitting}>
							{submitting ? "Starting…" : "Continue to payment"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function AddonsBlock({ ticketQuantity, addons, selection, onSetQty, onClearGroup }) {
	const { groups, ungrouped } = useMemo(() => groupAddons(addons), [addons]);

	return (
		<div className="space-y-3">
			<div className="flex items-baseline justify-between gap-3">
				<div className="text-xs uppercase tracking-[0.18em] text-foreground/70">Add-ons</div>
				<div className="text-xs text-muted-foreground">
					{ticketQuantity} ticket{ticketQuantity === 1 ? "" : "s"} on this line
				</div>
			</div>

			{groups.map((g) => {
				const groupTotal = g.items.reduce((s, it) => s + (selection[it.id] ?? 0), 0);
				const groupRemaining = Math.max(0, ticketQuantity - groupTotal);
				return (
					<div
						key={g.id}
						className="rounded-md border border-foreground/10 bg-background/40 p-3 space-y-2"
					>
						<div className="flex items-baseline justify-between gap-3">
							<div className="text-xs uppercase tracking-[0.18em] text-foreground/70">
								{g.label}
							</div>
							<div className="text-xs text-muted-foreground">
								{groupTotal} of {ticketQuantity} picked
								{groupTotal > 0 && (
									<button
										type="button"
										onClick={() => onClearGroup(g.items)}
										className="ml-2 underline hover:text-foreground"
									>
										Clear
									</button>
								)}
							</div>
						</div>
						<div className="grid gap-2">
							{g.items.map((a) => (
								<AddonCountRow
									key={a.id}
									addon={a}
									count={selection[a.id] ?? 0}
									max={Math.min(
										ticketQuantity,
										(selection[a.id] ?? 0) + groupRemaining,
									)}
									onSetQty={(q) => onSetQty(a.id, q)}
								/>
							))}
						</div>
					</div>
				);
			})}

			{ungrouped.length > 0 && (
				<div className="space-y-2">
					{ungrouped.map((a) => {
						const max = ticketQuantity * (a.max_quantity_per_ticket ?? 1);
						return (
							<AddonCountRow
								key={a.id}
								addon={a}
								count={selection[a.id] ?? 0}
								max={max}
								onSetQty={(q) => onSetQty(a.id, q)}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

function AddonCountRow({ addon, count, max, onSetQty }) {
	const inc = () => onSetQty(Math.min(max, count + 1));
	const dec = () => onSetQty(Math.max(0, count - 1));
	const selected = count > 0;
	return (
		<div
			className={`rounded-sm border p-2 transition ${
				selected
					? "border-primary bg-primary/5"
					: "border-foreground/10 bg-background"
			}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="text-sm">{addon.name}</div>
					{addon.description && (
						<div className="text-xs text-muted-foreground mt-0.5">{addon.description}</div>
					)}
					<div className="font-mono text-xs text-muted-foreground mt-1">
						{addon.price_cents > 0 ? formatGbp(addon.price_cents) : "Included"}
					</div>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<Button
						variant="outline"
						size="sm"
						onClick={dec}
						disabled={count === 0}
						aria-label="Decrease"
					>
						−
					</Button>
					<span className="w-6 text-center font-mono text-sm">{count}</span>
					<Button
						variant="outline"
						size="sm"
						onClick={inc}
						disabled={count >= max}
						aria-label="Increase"
					>
						+
					</Button>
				</div>
			</div>
		</div>
	);
}

function FeeOptIn({
	organiserName,
	feeIfCustomerPaysCents,
	feeIfOrganiserPaysCents,
	orderValueCents,
	borneByCustomer,
	coverFee,
	onChange,
}) {
	const hasName = !!organiserName;
	const subject = hasName ? organiserName : "the event organiser";

	return (
		<div className="rounded-md border border-foreground/10 bg-background p-3 text-xs space-y-2">
			<p className="text-foreground/85 leading-relaxed">
				{borneByCustomer ? (
					<>
						You&apos;ve covered the booking fee — {subject} will receive the full
						{" "}{formatGbp(orderValueCents)}.
					</>
				) : (
					<>
						Would you like to cover the {formatGbp(feeIfCustomerPaysCents)} processing
						fee so {subject} receives the full {formatGbp(orderValueCents)}?
					</>
				)}
			</p>
			<label className="flex items-center gap-2 cursor-pointer">
				<Checkbox checked={coverFee} onCheckedChange={(v) => onChange(!!v)} />
				<span>
					Cover the booking fee ({formatGbp(feeIfCustomerPaysCents)})
				</span>
			</label>
		</div>
	);
}

