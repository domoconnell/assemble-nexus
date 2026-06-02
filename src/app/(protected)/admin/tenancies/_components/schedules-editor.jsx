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
		label: "",
	};
}

/**
 * Editor for `tenancy_line.schedule_rule[]`. Each card is one rule.
 * Rate lives on the parent line (per billing mode), not the rule itself.
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
				? {
					...emptyWeeklyRule(),
					id: cur.id,
					by_weekday: cur.by_weekday ?? [],
					time_start: cur.time_start,
					time_end: cur.time_end,
					label: cur.label,
					interval: 1,
				}
				: {
					...emptyMonthlyRule(),
					id: cur.id,
					by_weekday: cur.by_weekday ?? [],
					time_start: cur.time_start,
					time_end: cur.time_end,
					label: cur.label,
					interval: 1,
				};
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
		<div className="space-y-3">
			{schedules.length === 0 && (
				<div className="rounded-md border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">
					No schedule rules yet. Add one.
				</div>
			)}

			{schedules.map((rule, idx) => (
				<div
					key={rule.id}
					className="rounded-md border bg-background p-3 space-y-3"
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
									className={`px-2.5 py-1 text-[11px] rounded-sm transition ${
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
							className="text-destructive hover:text-destructive text-xs"
						>
							Remove rule
						</Button>
					</div>

					{rule.kind === "monthly_nth" && (
						<div className="space-y-1.5">
							<Label className="text-xs">Which weeks of the month</Label>
							<div className="flex flex-wrap gap-1.5">
								{MONTH_POSITIONS.map((p) => {
									const active = rule.by_set_pos?.includes(p.value);
									return (
										<button
											key={p.value}
											type="button"
											onClick={() => togglePos(idx, p.value)}
											className={`rounded-md border px-2.5 py-1 text-xs transition ${
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

					<div className="space-y-1.5">
						<Label className="text-xs">Days of the week</Label>
						<div className="flex flex-wrap gap-1.5">
							{WEEKDAYS.map((d) => {
								const active = rule.by_weekday?.includes(d.key);
								return (
									<button
										key={d.key}
										type="button"
										onClick={() => toggleWeekday(idx, d.key)}
										className={`rounded-md border px-2.5 py-1 text-xs transition ${
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

					<div className="grid gap-3 sm:grid-cols-3 items-end">
						<div className="space-y-1.5">
							<Label className="text-xs">Start time</Label>
							<TimePicker
								value={rule.time_start ?? ""}
								onChange={(v) => updateAt(idx, { time_start: v })}
							/>
						</div>
						<div className="space-y-1.5">
							<Label className="text-xs">End time</Label>
							<TimePicker
								value={rule.time_end ?? ""}
								onChange={(v) => updateAt(idx, { time_end: v })}
							/>
						</div>
						<div className="space-y-1.5">
							<Label className="text-xs">
								{rule.kind === "weekly" ? "Every N weeks" : "Every N months"}
							</Label>
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
				</div>
			))}

			<Button type="button" variant="outline" size="sm" onClick={add}>
				+ Add schedule rule
			</Button>
		</div>
	);
}
