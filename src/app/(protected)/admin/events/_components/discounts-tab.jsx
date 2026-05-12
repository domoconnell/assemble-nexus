"use client";

import { useState } from "react";
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
import { saveTicketDiscountsAction } from "../actions";

const TRIGGER_OPTIONS = [
	{ value: "auto", label: "Auto-apply" },
	{ value: "code", label: "Discount code" },
];
const KIND_OPTIONS = [
	{ value: "percent", label: "Percentage off" },
	{ value: "fixed_cents", label: "Fixed amount off" },
	{ value: "nth_free", label: "Every Nth ticket free" },
];

function toIsoLocal(d) {
	if (!d) return "";
	const dt = new Date(d);
	if (Number.isNaN(dt.valueOf())) return "";
	const pad = (n) => String(n).padStart(2, "0");
	return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export default function DiscountsTab({
	eventId,
	initialDiscounts = [],
	ticketTypes = [],
	onSaved,
}) {
	const [rows, setRows] = useState(
		initialDiscounts.map((d) => ({
			id: d.id,
			label: d.label ?? "",
			trigger: d.trigger ?? "auto",
			code: d.code ?? "",
			kind: d.kind ?? "percent",
			value_x100: d.value_x100 ?? 1000,
			value_cents: d.value_cents ?? 0,
			n_free: d.n_free ?? 5,
			min_qty: d.min_qty ?? "",
			max_uses: d.max_uses ?? "",
			starts_at: toIsoLocal(d.starts_at),
			ends_at: toIsoLocal(d.ends_at),
			is_active: d.is_active !== false,
			ticket_type_ids: Array.isArray(d.ticket_type_ids) ? d.ticket_type_ids : [],
		})),
	);
	const [saving, setSaving] = useState(false);
	const [savedMsg, setSavedMsg] = useState(null);
	const [error, setError] = useState(null);

	function update(i, patch) {
		setRows((xs) => xs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
	}
	function add() {
		setRows((xs) => [
			...xs,
			{
				id: null,
				label: "",
				trigger: "auto",
				code: "",
				kind: "percent",
				value_x100: 1000,
				value_cents: 0,
				n_free: 5,
				min_qty: "",
				max_uses: "",
				starts_at: "",
				ends_at: "",
				is_active: true,
				ticket_type_ids: [],
			},
		]);
	}
	function remove(i) {
		setRows((xs) => xs.filter((_, j) => j !== i));
	}
	function toggleType(i, typeId) {
		setRows((xs) =>
			xs.map((r, j) => {
				if (j !== i) return r;
				const has = r.ticket_type_ids.includes(typeId);
				return {
					...r,
					ticket_type_ids: has
						? r.ticket_type_ids.filter((id) => id !== typeId)
						: [...r.ticket_type_ids, typeId],
				};
			}),
		);
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			const saved = await saveTicketDiscountsAction({
				event_id: eventId,
				discounts: rows.map((r) => ({
					id: r.id,
					label: r.label,
					trigger: r.trigger,
					code: r.trigger === "code" ? (r.code || null) : null,
					kind: r.kind,
					value_x100: r.kind === "percent" ? r.value_x100 : null,
					value_cents: r.kind === "fixed_cents" ? r.value_cents : null,
					n_free: r.kind === "nth_free" ? r.n_free : null,
					min_qty: r.min_qty === "" ? null : r.min_qty,
					max_uses: r.max_uses === "" ? null : r.max_uses,
					starts_at: r.starts_at || null,
					ends_at: r.ends_at || null,
					is_active: r.is_active,
					ticket_type_ids: r.ticket_type_ids,
				})),
			});
			onSaved?.(saved);
			setRows(
				saved.map((d) => ({
					id: d.id,
					label: d.label ?? "",
					trigger: d.trigger ?? "auto",
					code: d.code ?? "",
					kind: d.kind ?? "percent",
					value_x100: d.value_x100 ?? 1000,
					value_cents: d.value_cents ?? 0,
					n_free: d.n_free ?? 5,
					min_qty: d.min_qty ?? "",
					max_uses: d.max_uses ?? "",
					starts_at: toIsoLocal(d.starts_at),
					ends_at: toIsoLocal(d.ends_at),
					is_active: d.is_active,
					ticket_type_ids: d.ticket_type_ids ?? [],
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
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Discounts</h2>
					<p className="text-xs text-muted-foreground mt-1">
						Auto-applied rules (e.g. "5+ tickets, 10% off") and code-based rules. Bundles are
						matched first; auto-discounts apply next; code discounts last.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{savedMsg && <span className="text-xs text-muted-foreground">{savedMsg}</span>}
					<Button size="sm" onClick={save} disabled={saving}>
						{saving ? "Saving…" : "Save discounts"}
					</Button>
				</div>
			</div>
			{error && (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}
			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">No discounts yet.</p>
			) : (
				<div className="space-y-4">
					{rows.map((r, i) => (
						<div
							key={r.id ?? `d-new-${i}`}
							className={`rounded-md border bg-background p-5 space-y-4 ${r.is_active ? "" : "opacity-70"}`}
						>
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-3">
									<Checkbox
										checked={r.is_active}
										onCheckedChange={(v) => update(i, { is_active: !!v })}
									/>
									<span className="text-xs uppercase tracking-[0.18em] text-primary">
										{r.is_active ? "Active" : "Hidden"}
									</span>
								</div>
								<Button variant="ghost" size="sm" onClick={() => remove(i)}>
									Remove
								</Button>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2 sm:col-span-2">
									<Label>Label</Label>
									<Input
										value={r.label}
										onChange={(e) => update(i, { label: e.target.value })}
										placeholder="Early-bird discount"
									/>
								</div>
								<div className="space-y-2">
									<Label>Trigger</Label>
									<Select
										value={r.trigger}
										onValueChange={(v) => update(i, { trigger: v })}
									>
										<SelectTrigger><SelectValue /></SelectTrigger>
										<SelectContent>
											{TRIGGER_OPTIONS.map((o) => (
												<SelectItem key={o.value} value={o.value}>
													{o.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label>Code (if code-triggered)</Label>
									<Input
										value={r.code}
										onChange={(e) => update(i, { code: e.target.value.toUpperCase() })}
										disabled={r.trigger !== "code"}
										placeholder="EARLYBIRD"
									/>
								</div>
								<div className="space-y-2">
									<Label>Kind</Label>
									<Select
										value={r.kind}
										onValueChange={(v) => update(i, { kind: v })}
									>
										<SelectTrigger><SelectValue /></SelectTrigger>
										<SelectContent>
											{KIND_OPTIONS.map((o) => (
												<SelectItem key={o.value} value={o.value}>
													{o.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									{r.kind === "percent" && (
										<>
											<Label>Percentage off (%)</Label>
											<Input
												type="number"
												min="0"
												max="100"
												step="0.5"
												value={(r.value_x100 / 100).toString()}
												onChange={(e) =>
													update(i, {
														value_x100: Math.round(Number(e.target.value || 0) * 100),
													})
												}
											/>
										</>
									)}
									{r.kind === "fixed_cents" && (
										<>
											<Label>Amount off (£)</Label>
											<Input
												type="number"
												min="0"
												step="0.01"
												value={(r.value_cents / 100).toString()}
												onChange={(e) =>
													update(i, {
														value_cents: Math.round(Number(e.target.value || 0) * 100),
													})
												}
											/>
										</>
									)}
									{r.kind === "nth_free" && (
										<>
											<Label>Every Nth ticket free (N)</Label>
											<Input
												type="number"
												min="2"
												value={r.n_free}
												onChange={(e) =>
													update(i, { n_free: Math.max(2, Number(e.target.value || 2)) })
												}
											/>
										</>
									)}
								</div>
								<div className="space-y-2">
									<Label>Minimum tickets to fire (optional)</Label>
									<Input
										type="number"
										min="0"
										placeholder="None"
										value={r.min_qty}
										onChange={(e) =>
											update(i, {
												min_qty: e.target.value === "" ? "" : Number(e.target.value),
											})
										}
									/>
								</div>
								<div className="space-y-2">
									<Label>Max uses (optional)</Label>
									<Input
										type="number"
										min="0"
										placeholder="Unlimited"
										value={r.max_uses}
										onChange={(e) =>
											update(i, {
												max_uses: e.target.value === "" ? "" : Number(e.target.value),
											})
										}
									/>
								</div>
								<div className="space-y-2">
									<Label>Starts (optional)</Label>
									<Input
										type="datetime-local"
										value={r.starts_at}
										onChange={(e) => update(i, { starts_at: e.target.value })}
									/>
								</div>
								<div className="space-y-2">
									<Label>Ends (optional)</Label>
									<Input
										type="datetime-local"
										value={r.ends_at}
										onChange={(e) => update(i, { ends_at: e.target.value })}
									/>
								</div>
							</div>

							<div className="space-y-2 pt-3 border-t border-foreground/10">
								<Label>Applies to ticket types</Label>
								<p className="text-xs text-muted-foreground">
									Leave all unchecked to apply to every ticket type.
								</p>
								{!hasTicketTypes ? (
									<p className="text-xs text-muted-foreground">
										No ticket types defined yet.
									</p>
								) : (
									<div className="grid gap-2 sm:grid-cols-2">
										{ticketTypes.map((tt) => {
											const checked = r.ticket_type_ids.includes(tt.id);
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
														onCheckedChange={() => toggleType(i, tt.id)}
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
			<Button variant="outline" size="sm" onClick={add}>+ Add discount</Button>
		</section>
	);
}
