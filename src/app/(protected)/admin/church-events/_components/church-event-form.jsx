"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Checkbox } from "@/shadcn/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shadcn/components/ui/select";
import { DatePicker } from "@/site/booking/date-picker";
import { DateTimePicker } from "@/global/ui/components/date-time-picker";
import { TimePicker } from "@/site/booking/time-picker";
import { createChurchEventAction, updateChurchEventAction } from "../actions";

const WEEKDAYS = [
	{ key: "MO", label: "Mon" },
	{ key: "TU", label: "Tue" },
	{ key: "WE", label: "Wed" },
	{ key: "TH", label: "Thu" },
	{ key: "FR", label: "Fri" },
	{ key: "SA", label: "Sat" },
	{ key: "SU", label: "Sun" },
];

function toIsoLocal(d) {
	if (!d) return "";
	const date = new Date(d);
	if (Number.isNaN(date.getTime())) return "";
	// Format as YYYY-MM-DDTHH:MM in local time so DateTimePicker pre-fills.
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const h = String(date.getHours()).padStart(2, "0");
	const mi = String(date.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${day}T${h}:${mi}`;
}

/**
 * When editing, `initial` carries the existing event/series so the form
 * pre-fills. Adhoc events get the simple form; weekly/run series share
 * the same UI as the create flow, with the "kind" cards locked because
 * a series can't switch types in place.
 */
export default function ChurchEventForm({ rooms, initial = null }) {
	const router = useRouter();
	const isEdit = !!initial;

	const initialKind =
		initial?.recurrence_rule?.kind === "weekly"
			? "weekly"
			: initial?.recurrence_rule?.kind === "run"
				? "run"
				: initial
					? "adhoc"
					: "weekly";

	const [kind, setKind] = useState(initialKind);
	const [reason, setReason] = useState(initial?.reason ?? "");
	const [notes, setNotes] = useState(initial?.notes ?? "");
	const [isPublic, setIsPublic] = useState(initial?.is_public ?? false);
	const [roomIds, setRoomIds] = useState(initial?.room_ids ?? []);

	// adhoc
	const [adhocStart, setAdhocStart] = useState(
		initial && initialKind === "adhoc" ? toIsoLocal(initial.starts_at) : "",
	);
	const [adhocEnd, setAdhocEnd] = useState(
		initial && initialKind === "adhoc" ? toIsoLocal(initial.ends_at) : "",
	);

	// weekly
	const [byWeekday, setByWeekday] = useState(
		initial?.recurrence_rule?.kind === "weekly"
			? initial.recurrence_rule.by_weekday ?? []
			: [],
	);
	const [timeStart, setTimeStart] = useState(
		initial?.recurrence_rule?.time_start ?? "",
	);
	const [timeEnd, setTimeEnd] = useState(
		initial?.recurrence_rule?.time_end ?? "",
	);
	const [startsOn, setStartsOn] = useState(
		initial?.recurrence_rule?.starts_on ?? "",
	);
	const [endsOn, setEndsOn] = useState(
		initial?.recurrence_rule?.ends_on ?? "",
	);

	// run
	const [runWeekday, setRunWeekday] = useState(
		initial?.recurrence_rule?.kind === "run"
			? initial.recurrence_rule.weekday ?? "TU"
			: "TU",
	);
	const [weeks, setWeeks] = useState(
		initial?.recurrence_rule?.weeks ?? 6,
	);

	const [saving, setSaving] = useState(false);

	function toggleRoom(id) {
		setRoomIds((cur) => (cur.includes(id) ? cur.filter((r) => r !== id) : [...cur, id]));
	}

	function toggleWeekday(key) {
		setByWeekday((cur) =>
			cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
		);
	}

	async function submit(e) {
		e.preventDefault();
		setSaving(true);
		try {
			let payload;
			if (kind === "adhoc") {
				if (!adhocStart || !adhocEnd) {
					throw new Error("Start and end dates are required for adhoc events.");
				}
				payload = {
					kind: "adhoc",
					reason,
					notes: notes || null,
					is_public: isPublic,
					room_ids: roomIds,
					starts_at: adhocStart,
					ends_at: adhocEnd,
				};
			} else if (kind === "weekly") {
				if (byWeekday.length === 0) throw new Error("Pick at least one weekday.");
				if (!timeStart || !timeEnd || !startsOn) throw new Error("Times and start date are required.");
				payload = {
					kind: "weekly",
					reason,
					notes: notes || null,
					is_public: isPublic,
					room_ids: roomIds,
					by_weekday: byWeekday,
					time_start: timeStart,
					time_end: timeEnd,
					starts_on: startsOn,
					ends_on: endsOn || null,
				};
			} else if (kind === "run") {
				if (!timeStart || !timeEnd || !startsOn) throw new Error("Times and start date are required.");
				payload = {
					kind: "run",
					reason,
					notes: notes || null,
					is_public: isPublic,
					room_ids: roomIds,
					weekday: runWeekday,
					time_start: timeStart,
					time_end: timeEnd,
					starts_on: startsOn,
					weeks: Number(weeks),
				};
			}
			if (isEdit) {
				await updateChurchEventAction({ ...payload, id: initial.id });
				toast.success("Updated");
			} else {
				await createChurchEventAction(payload);
				toast.success("Created");
			}
			router.push("/admin/church-events");
		} catch (err) {
			toast.error(err?.message || "Couldn't save.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={submit} className="space-y-6">
			<section className="rounded-lg border bg-card p-6 space-y-5">
				<div className="space-y-2">
					<Label>Kind</Label>
					<div className="grid gap-3 sm:grid-cols-3">
						<KindCard
							active={kind === "weekly"}
							disabled={isEdit && initialKind !== "weekly"}
							onClick={() => !isEdit && setKind("weekly")}
							title="Weekly"
							blurb="Open-ended weekly pattern (e.g. Sunday morning service)."
						/>
						<KindCard
							active={kind === "run"}
							disabled={isEdit && initialKind !== "run"}
							onClick={() => !isEdit && setKind("run")}
							title="Run"
							blurb="A finite weekly series (e.g. 6-week course)."
						/>
						<KindCard
							active={kind === "adhoc"}
							disabled={isEdit && initialKind !== "adhoc"}
							onClick={() => !isEdit && setKind("adhoc")}
							title="Adhoc"
							blurb="A one-off event on a specific day."
						/>
					</div>
					{isEdit && (
						<p className="text-[10px] text-muted-foreground">
							Type is fixed once a church event has been created. To change it,
							cancel this one and create a new event.
						</p>
					)}
				</div>

				<div className="space-y-2">
					<Label htmlFor="reason">Title / reason</Label>
					<Input
						id="reason"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						placeholder="e.g. Sunday service, AGM, Bible course"
						required
						maxLength={200}
					/>
				</div>

				<div className="space-y-2">
					<Label>Rooms</Label>
					<div className="grid gap-2 sm:grid-cols-2">
						{rooms.map((r) => (
							<label
								key={r.id}
								className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer"
							>
								<Checkbox
									checked={roomIds.includes(r.id)}
									onCheckedChange={() => toggleRoom(r.id)}
								/>
								<div className="min-w-0 flex-1">
									<div className="text-sm font-medium">{r.name}</div>
									<div className="text-[10px] text-muted-foreground">
										{r.is_public === false ? "Private" : "Public"}
									</div>
								</div>
							</label>
						))}
					</div>
					<p className="text-[10px] text-muted-foreground">
						Leave all unticked to block every room at the venue.
					</p>
				</div>
			</section>

			{kind === "adhoc" && (
				<section className="rounded-lg border bg-card p-6 space-y-5">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						When
					</h2>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label>Starts</Label>
							<DateTimePicker value={adhocStart} onChange={setAdhocStart} allowPast />
						</div>
						<div className="space-y-2">
							<Label>Ends</Label>
							<DateTimePicker value={adhocEnd} onChange={setAdhocEnd} allowPast />
						</div>
					</div>
				</section>
			)}

			{kind === "weekly" && (
				<section className="rounded-lg border bg-card p-6 space-y-5">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Pattern
					</h2>
					<div className="space-y-2">
						<Label>Days of the week</Label>
						<div className="flex flex-wrap gap-2">
							{WEEKDAYS.map((d) => {
								const active = byWeekday.includes(d.key);
								return (
									<button
										key={d.key}
										type="button"
										onClick={() => toggleWeekday(d.key)}
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
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label>Start time</Label>
							<TimePicker value={timeStart} onChange={setTimeStart} />
						</div>
						<div className="space-y-2">
							<Label>End time</Label>
							<TimePicker value={timeEnd} onChange={setTimeEnd} />
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label>Starts on</Label>
							<DatePicker value={startsOn} onChange={setStartsOn} allowPast />
						</div>
						<div className="space-y-2">
							<Label>Ends on (optional)</Label>
							<DatePicker value={endsOn} onChange={setEndsOn} placeholder="Open-ended" allowPast />
							<p className="text-[10px] text-muted-foreground">Leave blank for an ongoing weekly event.</p>
						</div>
					</div>
				</section>
			)}

			{kind === "run" && (
				<section className="rounded-lg border bg-card p-6 space-y-5">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Run
					</h2>
					<div className="grid gap-4 sm:grid-cols-3">
						<div className="space-y-2">
							<Label>Weekday</Label>
							<Select value={runWeekday} onValueChange={setRunWeekday}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{WEEKDAYS.map((d) => (
										<SelectItem key={d.key} value={d.key}>
											{d.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Start time</Label>
							<TimePicker value={timeStart} onChange={setTimeStart} />
						</div>
						<div className="space-y-2">
							<Label>End time</Label>
							<TimePicker value={timeEnd} onChange={setTimeEnd} />
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label>First week starting</Label>
							<DatePicker value={startsOn} onChange={setStartsOn} allowPast />
						</div>
						<div className="space-y-2">
							<Label htmlFor="weeks">Number of weeks</Label>
							<Input
								id="weeks"
								type="number"
								min={1}
								max={104}
								value={weeks}
								onChange={(e) => setWeeks(e.target.value)}
								required
							/>
						</div>
					</div>
				</section>
			)}

			<section className="rounded-lg border bg-card p-6 space-y-3">
				<div className="space-y-2">
					<Label htmlFor="notes">Notes (optional)</Label>
					<Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
				</div>
				<label className="flex items-center gap-3">
					<Checkbox checked={isPublic} onCheckedChange={(v) => setIsPublic(!!v)} />
					<span className="text-sm">
						Show on public availability calendar
						<span className="block text-[10px] text-muted-foreground">
							Off by default - admin-only.
						</span>
					</span>
				</label>
			</section>

			<div className="flex items-center justify-end gap-3">
				<Button type="submit" disabled={saving}>
					{saving ? "Saving…" : isEdit ? "Save changes" : "Create"}
				</Button>
			</div>
		</form>
	);
}

function KindCard({ active, disabled, onClick, title, blurb }) {
	const base = "text-left rounded-lg border px-4 py-4 transition";
	const state = active
		? "border-primary bg-primary/5"
		: disabled
			? "border-foreground/10 bg-background opacity-40 cursor-not-allowed"
			: "border-foreground/10 hover:border-foreground/30 bg-background";
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`${base} ${state}`}
		>
			<div className="font-medium">{title}</div>
			<p className="text-xs text-muted-foreground mt-1">{blurb}</p>
		</button>
	);
}
