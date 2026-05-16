"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Checkbox } from "@/shadcn/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shadcn/components/ui/select";
import { saveTicketBundlesAction } from "../actions";

const NO_VAT = "__none__";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

export default function BundlesTab({
	eventId,
	initialBundles = [],
	ticketTypes = [],
	vatRates = [],
	onSaved,
}) {
	const [bundles, setBundles] = useState(
		initialBundles.map((b) => ({
			id: b.id,
			name: b.name ?? "",
			description: b.description ?? "",
			total_price_cents: b.total_price_cents ?? 0,
			vat_rate_id: b.vat_rate_id ?? null,
			vat_inclusive: !!b.vat_inclusive,
			is_active: b.is_active !== false,
			items: (b.items ?? []).map((it) => ({
				ticket_type_id: it.ticket_type_id,
				quantity: it.quantity,
			})),
		})),
	);
	const [saving, setSaving] = useState(false);
	const [savedMsg, setSavedMsg] = useState(null);
	const [error, setError] = useState(null);

	const ticketTypeById = useMemo(() => {
		const m = new Map();
		for (const t of ticketTypes) m.set(t.id, t);
		return m;
	}, [ticketTypes]);

	function update(i, patch) {
		setBundles((xs) => xs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
	}
	function add() {
		setBundles((xs) => [
			...xs,
			{
				id: null,
				name: "",
				description: "",
				total_price_cents: 0,
				vat_rate_id: null,
				vat_inclusive: false,
				is_active: true,
				items: ticketTypes.length ? [{ ticket_type_id: ticketTypes[0].id, quantity: 1 }] : [],
			},
		]);
	}
	function remove(i) {
		setBundles((xs) => xs.filter((_, j) => j !== i));
	}
	function setItemQty(bundleI, itemI, qty) {
		setBundles((xs) =>
			xs.map((b, j) =>
				j === bundleI
					? {
						...b,
						items: b.items.map((it, k) =>
							k === itemI ? { ...it, quantity: Math.max(1, qty) } : it,
						),
					}
					: b,
			),
		);
	}
	function setItemType(bundleI, itemI, typeId) {
		setBundles((xs) =>
			xs.map((b, j) =>
				j === bundleI
					? {
						...b,
						items: b.items.map((it, k) =>
							k === itemI ? { ...it, ticket_type_id: typeId } : it,
						),
					}
					: b,
			),
		);
	}
	function addItem(bundleI) {
		setBundles((xs) =>
			xs.map((b, j) =>
				j === bundleI
					? {
						...b,
						items: [
							...b.items,
							{
								ticket_type_id: ticketTypes[0]?.id ?? "",
								quantity: 1,
							},
						],
					}
					: b,
			),
		);
	}
	function removeItem(bundleI, itemI) {
		setBundles((xs) =>
			xs.map((b, j) =>
				j === bundleI
					? { ...b, items: b.items.filter((_, k) => k !== itemI) }
					: b,
			),
		);
	}

	function impliedSavings(b) {
		const sumOfParts = b.items.reduce((sum, it) => {
			const tt = ticketTypeById.get(it.ticket_type_id);
			return sum + (tt ? tt.price_cents * it.quantity : 0);
		}, 0);
		return Math.max(0, sumOfParts - (b.total_price_cents ?? 0));
	}

	async function save() {
		const invalid = bundles.find((b) => b.items.length === 0);
		if (invalid) {
			setError("Each bundle must include at least one ticket-type item.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const saved = await saveTicketBundlesAction({
				event_id: eventId,
				bundles: bundles.map((b) => ({
					id: b.id,
					name: b.name,
					description: b.description || null,
					total_price_cents: b.total_price_cents,
					vat_rate_id: b.vat_rate_id,
					vat_inclusive: b.vat_inclusive,
					is_active: b.is_active,
					items: b.items.filter((it) => it.ticket_type_id && it.quantity > 0),
				})),
			});
			onSaved?.(saved);
			setBundles(
				saved.map((b) => ({
					id: b.id,
					name: b.name,
					description: b.description ?? "",
					total_price_cents: b.total_price_cents,
					vat_rate_id: b.vat_rate_id,
					vat_inclusive: !!b.vat_inclusive,
					is_active: b.is_active,
					items: (b.items ?? []).map((it) => ({
						ticket_type_id: it.ticket_type_id,
						quantity: it.quantity,
					})),
				})),
			);
			setSavedMsg("Saved.");
			setTimeout(() => setSavedMsg(null), 1500);
		} catch (err) {
			setError(err?.message || "Save failed");
		} finally {
			setSaving(false);
		}
	}

	const hasTicketTypes = ticketTypes.length > 0;

	return (
		<section className="rounded-lg border bg-card p-6 space-y-5">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Bundles</h2>
					<p className="text-xs text-muted-foreground mt-1">
						Fixed-price packs (e.g. "Family pack - 2 × Adult + 2 × Child for £45"). Auto-applied
						when the cart contains the required quantities.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{savedMsg && <span className="text-xs text-muted-foreground">{savedMsg}</span>}
					<Button size="sm" onClick={save} disabled={saving}>
						{saving ? "Saving…" : "Save bundles"}
					</Button>
				</div>
			</div>
			{error && (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}
			{!hasTicketTypes && (
				<div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
					Add ticket types first - bundles are made up of ticket-type quantities.
				</div>
			)}
			{bundles.length === 0 ? (
				<p className="text-sm text-muted-foreground">No bundles yet.</p>
			) : (
				<div className="space-y-4">
					{bundles.map((b, i) => {
						const savings = impliedSavings(b);
						return (
							<div
								key={b.id ?? `b-new-${i}`}
								className={`rounded-md border bg-background p-5 space-y-4 ${b.is_active ? "" : "opacity-70"}`}
							>
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-3">
										<Checkbox
											checked={b.is_active}
											onCheckedChange={(v) => update(i, { is_active: !!v })}
										/>
										<span className="text-xs uppercase tracking-[0.18em] text-primary">
											{b.is_active ? "Active" : "Hidden"}
										</span>
									</div>
									<Button variant="ghost" size="sm" onClick={() => remove(i)}>
										Remove
									</Button>
								</div>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2 sm:col-span-2">
										<Label>Name</Label>
										<Input
											value={b.name}
											onChange={(e) => update(i, { name: e.target.value })}
											placeholder="Family pack"
										/>
									</div>
									<div className="space-y-2 sm:col-span-2">
										<Label>Description (optional)</Label>
										<Input
											value={b.description}
											onChange={(e) => update(i, { description: e.target.value })}
										/>
									</div>
									<div className="space-y-2">
										<Label>Total price (£)</Label>
										<Input
											type="number"
											min="0"
											step="0.01"
											value={(b.total_price_cents / 100).toString()}
											onChange={(e) =>
												update(i, {
													total_price_cents: Math.round(Number(e.target.value || 0) * 100),
												})
											}
										/>
										<p className="text-xs text-muted-foreground">
											{formatGbp(b.total_price_cents)}
											{savings > 0 && (
												<span className="text-primary">
													{" "}· saves {formatGbp(savings)}
												</span>
											)}
										</p>
									</div>
									<div className="space-y-2">
										<Label>VAT</Label>
										<Select
											value={b.vat_rate_id ?? NO_VAT}
											onValueChange={(v) =>
												update(i, { vat_rate_id: v === NO_VAT ? null : v })
											}
										>
											<SelectTrigger><SelectValue /></SelectTrigger>
											<SelectContent>
												<SelectItem value={NO_VAT}>No VAT</SelectItem>
												{vatRates.map((vr) => (
													<SelectItem key={vr.id} value={vr.id}>
														{vr.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="flex items-end gap-2 pb-1">
										<Checkbox
											id={`bundle-vat-inc-${i}`}
											checked={!!b.vat_inclusive}
											onCheckedChange={(v) => update(i, { vat_inclusive: !!v })}
										/>
										<Label htmlFor={`bundle-vat-inc-${i}`}>Price includes VAT</Label>
									</div>
								</div>

								<div className="space-y-2 pt-3 border-t border-foreground/10">
									<Label>Includes</Label>
									<div className="space-y-2">
										{b.items.map((it, k) => (
											<div
												key={k}
												className="flex items-center gap-2"
											>
												<Input
													type="number"
													min="1"
													value={it.quantity}
													onChange={(e) =>
														setItemQty(i, k, Number(e.target.value || 1))
													}
													className="w-20"
												/>
												<span className="text-sm text-muted-foreground">×</span>
												<Select
													value={it.ticket_type_id}
													onValueChange={(v) => setItemType(i, k, v)}
												>
													<SelectTrigger className="flex-1">
														<SelectValue placeholder="Pick a ticket type" />
													</SelectTrigger>
													<SelectContent>
														{ticketTypes.map((tt) => (
															<SelectItem key={tt.id} value={tt.id}>
																{tt.name} · {formatGbp(tt.price_cents)}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => removeItem(i, k)}
													disabled={b.items.length === 1}
												>
													Remove
												</Button>
											</div>
										))}
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => addItem(i)}
										disabled={!hasTicketTypes}
									>
										+ Add another type
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			)}
			<Button variant="outline" size="sm" onClick={add} disabled={!hasTicketTypes}>
				+ Add bundle
			</Button>
		</section>
	);
}
