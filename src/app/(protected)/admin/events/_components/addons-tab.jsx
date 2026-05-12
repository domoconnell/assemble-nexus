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
import { saveTicketAddonsAction } from "../actions";

const NO_VAT = "__none__";
const NO_GROUP = "__none__";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

export default function AddonsTab({
	eventId,
	initialGroups = [],
	initialAddons = [],
	ticketTypes = [],
	vatRates = [],
	onSaved,
}) {
	const [groups, setGroups] = useState(
		initialGroups.map((g) => ({ id: g.id, label: g.label ?? "" })),
	);
	const [addons, setAddons] = useState(
		initialAddons.map((a) => ({
			id: a.id,
			group_id: a.group_id ?? null,
			name: a.name ?? "",
			description: a.description ?? "",
			price_cents: a.price_cents ?? 0,
			vat_rate_id: a.vat_rate_id ?? null,
			vat_inclusive: !!a.vat_inclusive,
			max_quantity_per_ticket: a.max_quantity_per_ticket ?? 1,
			is_active: a.is_active !== false,
			ticket_type_ids: Array.isArray(a.ticket_type_ids) ? a.ticket_type_ids : [],
		})),
	);
	const [saving, setSaving] = useState(false);
	const [savedMsg, setSavedMsg] = useState(null);
	const [error, setError] = useState(null);

	function updateGroup(i, patch) {
		setGroups((xs) => xs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
	}
	function addGroup() {
		setGroups((xs) => [...xs, { id: null, label: "" }]);
	}
	function removeGroup(i) {
		const removed = groups[i];
		const removedKey = removed.id ?? `new-${i}`;
		setGroups((xs) => xs.filter((_, j) => j !== i));
		setAddons((xs) =>
			xs.map((a) => (a.group_id === removedKey ? { ...a, group_id: null } : a)),
		);
	}

	function groupOptions() {
		return groups.map((g, i) => ({
			value: g.id ?? `new-${i}`,
			label: g.label || "(unnamed set)",
		}));
	}

	function updateAddon(i, patch) {
		setAddons((xs) => xs.map((a, j) => (j === i ? { ...a, ...patch } : a)));
	}
	function addAddon() {
		setAddons((xs) => [
			...xs,
			{
				id: null,
				group_id: null,
				name: "",
				description: "",
				price_cents: 0,
				vat_rate_id: null,
				vat_inclusive: false,
				max_quantity_per_ticket: 1,
				is_active: true,
				ticket_type_ids: [],
			},
		]);
	}
	function removeAddon(i) {
		setAddons((xs) => xs.filter((_, j) => j !== i));
	}
	function toggleAddonTicketType(i, typeId) {
		setAddons((xs) =>
			xs.map((a, j) => {
				if (j !== i) return a;
				const has = a.ticket_type_ids.includes(typeId);
				return {
					...a,
					ticket_type_ids: has
						? a.ticket_type_ids.filter((id) => id !== typeId)
						: [...a.ticket_type_ids, typeId],
				};
			}),
		);
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			const groupsPayload = groups.map((g) => ({ id: g.id, label: g.label }));
			const addonsPayload = addons.map((a) => ({
				id: a.id,
				group_id: a.group_id, // string id (existing uuid) or "new-N" placeholder; server resolves
				name: a.name,
				description: a.description || null,
				price_cents: a.price_cents,
				vat_rate_id: a.vat_rate_id,
				vat_inclusive: a.vat_inclusive,
				max_quantity_per_ticket: a.max_quantity_per_ticket,
				is_active: a.is_active,
				ticket_type_ids: a.ticket_type_ids,
			}));
			const result = await saveTicketAddonsAction({
				event_id: eventId,
				groups: groupsPayload,
				addons: addonsPayload,
			});
			setGroups(result.groups.map((g) => ({ id: g.id, label: g.label })));
			setAddons(
				result.addons.map((a) => ({
					id: a.id,
					group_id: a.group_id ?? null,
					name: a.name,
					description: a.description ?? "",
					price_cents: a.price_cents,
					vat_rate_id: a.vat_rate_id,
					vat_inclusive: !!a.vat_inclusive,
					max_quantity_per_ticket: a.max_quantity_per_ticket,
					is_active: a.is_active,
					ticket_type_ids: a.ticket_type_ids ?? [],
				})),
			);
			onSaved?.(result);
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
		<div className="space-y-8">
			<section className="rounded-lg border bg-card p-6 space-y-4">
				<div className="flex items-start justify-between gap-4 flex-wrap">
					<div className="min-w-0">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
							Choose-one sets
						</h2>
						<p className="mt-1 text-xs text-muted-foreground max-w-md">
							Group add-ons here when the customer should pick only one within the set
							(e.g. seating tier). Add-ons not in any set remain free to combine.
						</p>
					</div>
					<Button type="button" size="sm" variant="outline" onClick={addGroup}>
						+ Set
					</Button>
				</div>
				{groups.length === 0 ? (
					<p className="text-sm text-muted-foreground">No sets yet.</p>
				) : (
					<div className="space-y-2">
						{groups.map((g, i) => (
							<div
								key={g.id ?? `g-new-${i}`}
								className="flex items-center gap-3 rounded-md border bg-background p-3"
							>
								<Input
									value={g.label}
									onChange={(e) => updateGroup(i, { label: e.target.value })}
									placeholder="Set label (e.g. 'Seating tier')"
									className="flex-1"
								/>
								<Button variant="ghost" size="sm" onClick={() => removeGroup(i)}>
									Remove
								</Button>
							</div>
						))}
					</div>
				)}
			</section>

			<section className="rounded-lg border bg-card p-6 space-y-5">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
							Add-ons
						</h2>
						<p className="text-xs text-muted-foreground mt-1">
							Optional extras attached to one or more ticket types.
						</p>
					</div>
					<div className="flex items-center gap-2">
						{savedMsg && <span className="text-xs text-muted-foreground">{savedMsg}</span>}
						<Button size="sm" onClick={save} disabled={saving}>
							{saving ? "Saving…" : "Save add-ons"}
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
						Add a ticket type first — add-ons need at least one ticket type to attach to.
					</div>
				)}
				{addons.length === 0 ? (
					<p className="text-sm text-muted-foreground">No add-ons yet.</p>
				) : (
					<div className="space-y-4">
						{addons.map((a, i) => (
							<div
								key={a.id ?? `a-new-${i}`}
								className={`rounded-md border bg-background p-5 space-y-4 ${a.is_active ? "" : "opacity-70"}`}
							>
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-3">
										<Checkbox
											checked={a.is_active}
											onCheckedChange={(v) => updateAddon(i, { is_active: !!v })}
										/>
										<span className="text-xs uppercase tracking-[0.18em] text-primary">
											{a.is_active ? "Active" : "Hidden"}
										</span>
									</div>
									<Button variant="ghost" size="sm" onClick={() => removeAddon(i)}>
										Remove
									</Button>
								</div>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2 sm:col-span-2">
										<Label>Name</Label>
										<Input
											value={a.name}
											onChange={(e) => updateAddon(i, { name: e.target.value })}
										/>
									</div>
									<div className="space-y-2 sm:col-span-2">
										<Label>Description (optional)</Label>
										<Input
											value={a.description}
											onChange={(e) => updateAddon(i, { description: e.target.value })}
										/>
									</div>
									<div className="space-y-2">
										<Label>Price (£)</Label>
										<Input
											type="number"
											min="0"
											step="0.01"
											value={(a.price_cents / 100).toString()}
											onChange={(e) =>
												updateAddon(i, {
													price_cents: Math.round(Number(e.target.value || 0) * 100),
												})
											}
										/>
										<p className="text-xs text-muted-foreground">
											{formatGbp(a.price_cents)}
										</p>
									</div>
									<div className="space-y-2">
										<Label>Max quantity per ticket</Label>
										<Input
											type="number"
											min="1"
											max="50"
											value={a.max_quantity_per_ticket}
											onChange={(e) =>
												updateAddon(i, {
													max_quantity_per_ticket: Math.max(1, Number(e.target.value || 1)),
												})
											}
										/>
									</div>
									<div className="space-y-2">
										<Label>VAT</Label>
										<Select
											value={a.vat_rate_id ?? NO_VAT}
											onValueChange={(v) =>
												updateAddon(i, { vat_rate_id: v === NO_VAT ? null : v })
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
											id={`addon-vat-inc-${i}`}
											checked={!!a.vat_inclusive}
											onCheckedChange={(v) => updateAddon(i, { vat_inclusive: !!v })}
										/>
										<Label htmlFor={`addon-vat-inc-${i}`}>Price includes VAT</Label>
									</div>
									<div className="space-y-2 sm:col-span-2">
										<Label>Choose-one set (optional)</Label>
										<Select
											value={a.group_id ?? NO_GROUP}
											onValueChange={(v) =>
												updateAddon(i, { group_id: v === NO_GROUP ? null : v })
											}
										>
											<SelectTrigger>
												<SelectValue placeholder="Not in a set" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={NO_GROUP}>Not in a set</SelectItem>
												{groupOptions().map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>
														{opt.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>

								<div className="space-y-2 pt-3 border-t border-foreground/10">
									<Label>Offer this add-on for these ticket types</Label>
									{!hasTicketTypes ? (
										<p className="text-xs text-muted-foreground">
											No ticket types defined yet.
										</p>
									) : (
										<div className="grid gap-2 sm:grid-cols-2">
											{ticketTypes.map((tt) => {
												const checked = a.ticket_type_ids.includes(tt.id);
												return (
													<label
														key={tt.id}
														className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer ${
															checked
																? "border-primary bg-primary/5"
																: "border-foreground/10 hover:border-foreground/30 bg-background"
														}`}
													>
														<Checkbox
															checked={checked}
															onCheckedChange={() => toggleAddonTicketType(i, tt.id)}
														/>
														<span className="text-sm truncate">{tt.name}</span>
													</label>
												);
											})}
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				)}
				<Button variant="outline" size="sm" onClick={addAddon} disabled={!hasTicketTypes}>
					+ Add add-on
				</Button>
			</section>
		</div>
	);
}
