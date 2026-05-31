"use client";

import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { TimePicker } from "@/site/booking/time-picker";

const WEEKDAYS = [
	{ key: "MO", label: "Mon" },
	{ key: "TU", label: "Tue" },
	{ key: "WE", label: "Wed" },
	{ key: "TH", label: "Thu" },
	{ key: "FR", label: "Fri" },
	{ key: "SA", label: "Sat" },
	{ key: "SU", label: "Sun" },
];

const MONTH_POSITIONS = [
	{ value: 1, label: "1st" },
	{ value: 2, label: "2nd" },
	{ value: 3, label: "3rd" },
	{ value: 4, label: "4th" },
	{ value: -1, label: "Last" },
];

function newId() {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return `r_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyWeeklyRule() {
	return {
		id: newId(),
		kind: "weekly",
		by_weekday: [],
		interval: 1,
		time_start: "",
		time_end: "",
		per_session_rate_cents: null,
		label: "",
	};
}

function emptyMonthlyRule() {
	return {
		id: newId(),
		kind: "monthly_nth",
		by_weekday: [],
		by_set_pos: [],
		interval: 1,
		time_start: "",
		time_end: "",
		per_session_rate_cents: null,
		label: "",
	};
}

function ratePounds(cents) {
	if (cents == null) return "";
	return (cents / 100).toString();
}
function rateCents(pounds) {
	const n = Number(pounds);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(n * 100);
}

/**
 * Editor for `tenancy.schedule_rule[]`. Each card is one rule. Adding a
 * rule appends a fresh weekly skeleton; the kind switcher converts the
 * card between weekly and monthly_nth in place. The parent owns the
 * array state - this is purely controlled.
 */
export default function SchedulesEditor({ value, onChange }) {
	const schedules = Array.isArray(value) ? value : [];

	function updateAt(idx, patch) {
		onChange(schedules.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
	}
	function changeKind(idx, kind) {
		const cur = schedules[idx];
		const next =
			kind === "weekly"
				? { ...emptyWeeklyRule(), id: cur.id, by_weekday: cur.by_weekday ?? [], time_start: cur.time_start, time_end: cur.time_end, per_session_rate_cents: cur.per_session_rate_cents, label: cur.label, interval: 1 }
				: { ...emptyMonthlyRule(), id: cur.id, by_weekday: cur.by_weekday ?? [], time_start: cur.time_start, time_end: cur.time_end, per_session_rate_cents: cur.per_session_rate_cents, label: cur.label, interval: 1 };
		onChange(schedules.map((s, i) => (i === idx ? next : s)));
	}
	function toggleWeekday(idx, key) {
		const cur = schedules[idx];
		const next = cur.by_weekday?.includes(key)
			? cur.by_weekday.filter((k) => k !== key)
			: [...(cur.by_weekday ?? []), key];
		updateAt(idx, { by_weekday: next });
	}
	function togglePos(idx, value) {
		const cur = schedules[idx];
		const next = cur.by_set_pos?.includes(value)
			? cur.by_set_pos.filter((v) => v !== value)
			: [...(cur.by_set_pos ?? []), value];
		updateAt(idx, { by_set_pos: next });
	}
	function remove(idx) {
		onChange(schedules.filter((_, i) => i !== idx));
	}
	function add() {
		onChange([...schedules, emptyWeeklyRule()]);
	}

	return (
		<div className="space-y-4">
			{schedules.length === 0 && (
				<div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
					No schedules yet. Add one to start.
				</div>
			)}

			{schedules.map((rule, idx) => (
				<div
					key={rule.id}
					className="rounded-lg border bg-card p-4 space-y-4"
				>
					<div className="flex items-center justify-between gap-3 flex-wrap">
						<div className="flex gap-1 rounded-md border bg-background p-0.5">
							{[
								{ key: "weekly", label: "Weekly" },
								{ key: "monthly_nth", label: "Monthly (nth weekday)" },
							].map((opt) => (
								<button
									key={opt.key}
									type="button"
									onClick={() => changeKind(idx, opt.key)}
									className={`px-3 py-1 text-xs rounded-sm transition ${
										rule.kind === opt.key
											? "bg-primary/10 text-primary"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									{opt.label}
								</button>
							))}
						</div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => remove(idx)}
							className="text-destructive hover:text-destructive"
						>
							Remove
						</Button>
					</div>

					{rule.kind === "monthly_nth" && (
						<div className="space-y-2">
							<Label>Which weeks of the month</Label>
							<div className="flex flex-wrap gap-2">
								{MONTH_POSITIONS.map((p) => {
									const active = rule.by_set_pos?.includes(p.value);
									return (
										<button
											key={p.value}
											type="button"
											onClick={() => togglePos(idx, p.value)}
											className={`rounded-md border px-3 py-1.5 text-sm transition ${
												active
													? "border-primary bg-primary/10 text-primary"
													: "border-foreground/15 hover:border-foreground/30"
											}`}
										>
											{p.label}
										</button>
									);
								})}
							</div>
						</div>
					)}

					<div className="space-y-2">
						<Label>Days of the week</Label>
						<div className="flex flex-wrap gap-2">
							{WEEKDAYS.map((d) => {
								const active = rule.by_weekday?.includes(d.key);
								return (
									<button
										key={d.key}
										type="button"
										onClick={() => toggleWeekday(idx, d.key)}
										className={`rounded-md border px-3 py-1.5 text-sm transition ${
											active
												? "border-primary bg-primary/10 text-primary"
												: "border-foreground/15 hover:border-foreground/30"
										}`}
									>
										{d.label}
									</button>
								);
							})}
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-4 items-end">
						<div className="space-y-2">
							<Label>Start time</Label>
							<TimePicker
								value={rule.time_start ?? ""}
								onChange={(v) => updateAt(idx, { time_start: v })}
							/>
						</div>
						<div className="space-y-2">
							<Label>End time</Label>
							<TimePicker
								value={rule.time_end ?? ""}
								onChange={(v) => updateAt(idx, { time_end: v })}
							/>
						</div>
						<div className="space-y-2">
							<Label>Rate per session (£)</Label>
							<Input
								type="number"
								min={0}
								step="0.01"
								value={ratePounds(rule.per_session_rate_cents)}
								onChange={(e) =>
									updateAt(idx, { per_session_rate_cents: rateCents(e.target.value) })
								}
								placeholder="e.g. 20"
							/>
						</div>
						<div className="space-y-2">
							<Label>{rule.kind === "weekly" ? "Every N weeks" : "Every N months"}</Label>
							<Input
								type="number"
								min={1}
								max={rule.kind === "weekly" ? 52 : 12}
								value={rule.interval ?? 1}
								onChange={(e) =>
									updateAt(idx, {
										interval: Math.max(1, Number(e.target.value) || 1),
									})
								}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label>Label (optional, shown on invoice line)</Label>
						<Input
							value={rule.label ?? ""}
							onChange={(e) => updateAt(idx, { label: e.target.value })}
							maxLength={80}
							placeholder="e.g. Monday mornings"
						/>
					</div>
				</div>
			))}

			<Button type="button" variant="outline" onClick={add}>
				+ Add schedule
			</Button>
		</div>
	);
}
