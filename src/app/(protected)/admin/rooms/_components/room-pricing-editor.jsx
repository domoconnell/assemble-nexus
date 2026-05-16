"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { saveRoomPricingAction } from "../actions";

const NO_VAT = "__none__";

function ruleForType(rules, bookingTypeId) {
	return rules.find((r) => r.booking_type_id === bookingTypeId) ?? null;
}

function centsToPoundsStr(cents) {
	if (cents == null) return "";
	const n = Number(cents) / 100;
	if (!Number.isFinite(n)) return "";
	// Trim trailing zeros after the decimal point so "50" stays "50", not "50.00",
	// while preserving "50.5" → "50.5".
	return n.toString();
}

function poundsStrToCents(s) {
	if (s == null || s === "") return null;
	const n = Number(s);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(n * 100);
}

function defaultsFor(bookingTypeId) {
	return {
		id: null,
		booking_type_id: bookingTypeId,
		amount_pounds: "",
		daily_cap_pounds: "",
		min_hours: "",
		vat_rate_id: null,
		vat_inclusive: false,
	};
}

export default function RoomPricingEditor({ roomId, offeredTypes, vatRates, initialRules }) {
	const router = useRouter();

	const [drafts, setDrafts] = useState(() => {
		const map = new Map();
		for (const t of offeredTypes) {
			const existing = ruleForType(initialRules, t.id);
			map.set(t.id, existing ? {
				id: existing.id,
				booking_type_id: t.id,
				amount_pounds: centsToPoundsStr(existing.amount_cents ?? 0),
				daily_cap_pounds: centsToPoundsStr(existing.daily_cap_cents),
				min_hours: existing.min_hours == null ? "" : String(existing.min_hours),
				vat_rate_id: existing.vat_rate_id ?? null,
				vat_inclusive: !!existing.vat_inclusive,
			} : defaultsFor(t.id));
		}
		return map;
	});
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState(null);
	const [error, setError] = useState(null);

	function update(typeId, patch) {
		setDrafts((m) => {
			const next = new Map(m);
			next.set(typeId, { ...next.get(typeId), ...patch });
			return next;
		});
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			const rules = offeredTypes.map((t) => {
				const d = drafts.get(t.id) ?? defaultsFor(t.id);
				return {
					id: d.id,
					booking_type_id: t.id,
					amount_cents: poundsStrToCents(d.amount_pounds) ?? 0,
					daily_cap_cents: poundsStrToCents(d.daily_cap_pounds),
					min_hours: d.min_hours === "" ? null : d.min_hours,
					vat_rate_id: d.vat_rate_id,
					vat_inclusive: !!d.vat_inclusive,
				};
			});
			const saved = await saveRoomPricingAction({ room_id: roomId, rules });
			setDrafts((m) => {
				const next = new Map(m);
				for (const s of saved) {
					const cur = next.get(s.booking_type_id);
					if (cur) next.set(s.booking_type_id, { ...cur, id: s.id });
				}
				return next;
			});
			setSavedAt(new Date());
			router.refresh();
		} catch (err) {
			setError(err?.message || "Save failed");
		} finally {
			setSaving(false);
		}
	}

	if (offeredTypes.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				This room has no booking types enabled. Tick at least one in the Details tab.
			</p>
		);
	}

	return (
		<div className="space-y-8">
			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
					{error}
				</div>
			)}

			<div className="divide-y divide-foreground/10">
				{offeredTypes.map((t) => {
					const d = drafts.get(t.id) ?? defaultsFor(t.id);
					return (
						<div key={t.id} className="py-6 first:pt-0 last:pb-0 space-y-4">
							<div>
								<h3 className="font-medium">{t.label}</h3>
								{t.description && (
									<p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>
								)}
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label>Hourly rate (£)</Label>
									<Input
										type="number"
										inputMode="decimal"
										min="0"
										step="0.01"
										value={d.amount_pounds}
										onChange={(e) => update(t.id, { amount_pounds: e.target.value })}
									/>
								</div>
								<div className="space-y-2">
									<Label>Daily cap (£, optional)</Label>
									<Input
										type="number"
										inputMode="decimal"
										min="0"
										step="0.01"
										placeholder="-"
										value={d.daily_cap_pounds}
										onChange={(e) => update(t.id, { daily_cap_pounds: e.target.value })}
									/>
								</div>
								<div className="space-y-2">
									<Label>Minimum hours per booking</Label>
									<Input
										type="number"
										min="0"
										placeholder="-"
										value={d.min_hours ?? ""}
										onChange={(e) => update(t.id, { min_hours: e.target.value })}
									/>
								</div>
								<div className="space-y-2">
									<Label>VAT</Label>
									<Select
										value={d.vat_rate_id ?? NO_VAT}
										onValueChange={(v) =>
											update(t.id, { vat_rate_id: v === NO_VAT ? null : v })
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
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
								<div className="flex items-end gap-2 pb-1 sm:col-span-2">
									<Checkbox
										id={`vat-inc-${t.id}`}
										checked={!!d.vat_inclusive}
										onCheckedChange={(v) => update(t.id, { vat_inclusive: !!v })}
									/>
									<Label htmlFor={`vat-inc-${t.id}`}>Hourly rate includes VAT</Label>
								</div>
							</div>
						</div>
					);
				})}
			</div>

			<div className="flex items-center justify-end gap-3">
				{savedAt && <span className="text-xs text-muted-foreground">Saved.</span>}
				<Button onClick={save} disabled={saving}>
					{saving ? "Saving…" : "Save pricing"}
				</Button>
			</div>
		</div>
	);
}
