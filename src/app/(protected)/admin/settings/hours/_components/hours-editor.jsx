"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { saveHourlyBandsAction } from "../actions";

const HOURS = Array.from({ length: 17 }, (_, i) => String(i + 7).padStart(2, "0"));
const HOURS_WITH_MIDNIGHT = [...HOURS, "24"];
const MINUTES = ["00", "15", "30", "45"];

function emptyBand() {
	return { label: "", from: "09:00", to: "17:00", modifier_x100: 10000 };
}

function HmmField({ value, onChange, options }) {
	const [h, m] = value.split(":");
	return (
		<div className="grid grid-cols-2 gap-1.5">
			<select
				className="h-9 rounded-md border bg-background px-2 text-sm"
				value={h}
				onChange={(e) => onChange(`${e.target.value}:${m}`)}
			>
				{options.map((o) => (
					<option key={o} value={o}>{o}</option>
				))}
			</select>
			<select
				className="h-9 rounded-md border bg-background px-2 text-sm"
				value={m}
				onChange={(e) => onChange(`${h}:${e.target.value}`)}
			>
				{MINUTES.map((o) => (
					<option key={o} value={o}>{o}</option>
				))}
			</select>
		</div>
	);
}

export default function HoursEditor({ initialBands }) {
	const router = useRouter();
	const [bands, setBands] = useState(initialBands.length ? initialBands : [emptyBand()]);
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState(null);
	const [error, setError] = useState(null);

	function update(i, patch) {
		setBands((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
	}
	function remove(i) {
		setBands((bs) => bs.filter((_, j) => j !== i));
	}
	function add() {
		const last = bands[bands.length - 1];
		setBands((bs) => [
			...bs,
			{ ...emptyBand(), from: last?.to ?? "09:00" },
		]);
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			await saveHourlyBandsAction({ bands });
			setSavedAt(new Date());
			router.refresh();
		} catch (err) {
			setError(err?.message || "Save failed");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-6">
			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
					{error}
				</div>
			)}

			<div className="rounded-lg border bg-card p-6 space-y-5">
				<div>
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Hourly bands</h2>
					<p className="text-xs text-muted-foreground mt-2">
						Hires are only available 07:00-24:00. Each band carries a percentage modifier on the room&apos;s
						standard hourly rate. Bands must not overlap and should cover the full operating window.
					</p>
				</div>

				<div className="space-y-3">
					{bands.map((b, i) => (
						<div key={i} className="grid gap-3 rounded-md border bg-background p-4 sm:grid-cols-[1.4fr_1fr_1fr_120px_auto]">
							<div className="space-y-1.5">
								<Label className="text-xs uppercase tracking-[0.18em]">Label</Label>
								<Input value={b.label} onChange={(e) => update(i, { label: e.target.value })} />
							</div>
							<div className="space-y-1.5">
								<Label className="text-xs uppercase tracking-[0.18em]">From</Label>
								<HmmField value={b.from} onChange={(v) => update(i, { from: v })} options={HOURS} />
							</div>
							<div className="space-y-1.5">
								<Label className="text-xs uppercase tracking-[0.18em]">To</Label>
								<HmmField value={b.to} onChange={(v) => update(i, { to: v })} options={HOURS_WITH_MIDNIGHT} />
							</div>
							<div className="space-y-1.5">
								<Label className="text-xs uppercase tracking-[0.18em]">Modifier (%)</Label>
								<Input
									type="number"
									min="0"
									max="500"
									step="1"
									value={Math.round(b.modifier_x100 / 100)}
									onChange={(e) =>
										update(i, { modifier_x100: Math.round(Number(e.target.value || 0) * 100) })
									}
								/>
							</div>
							<div className="flex items-end">
								<Button variant="ghost" size="sm" onClick={() => remove(i)} disabled={bands.length <= 1}>
									Remove
								</Button>
							</div>
						</div>
					))}
				</div>

				<Button variant="outline" size="sm" onClick={add}>
					+ Band
				</Button>

				<div className="flex items-center justify-end gap-3">
					{savedAt && <span className="text-xs text-muted-foreground">Saved.</span>}
					<Button onClick={save} disabled={saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</div>
			</div>
		</div>
	);
}
