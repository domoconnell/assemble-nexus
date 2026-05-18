"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Checkbox } from "@/shadcn/components/ui/checkbox";
import { createChurchEventAction } from "../actions";

const WEEKDAYS = [
	{ key: "MO", label: "Mon" },
	{ key: "TU", label: "Tue" },
	{ key: "WE", label: "Wed" },
	{ key: "TH", label: "Thu" },
	{ key: "FR", label: "Fri" },
	{ key: "SA", label: "Sat" },
	{ key: "SU", label: "Sun" },
];

export default function ChurchEventForm({ rooms }) {
	const router = useRouter();
	const [kind, setKind] = useState("weekly");
	const [reason, setReason] = useState("");
	const [notes, setNotes] = useState("");
	const [isPublic, setIsPublic] = useState(false);
	const [roomIds, setRoomIds] = useState([]);

	// adhoc
	const [adhocStart, setAdhocStart] = useState("");
	const [adhocEnd, setAdhocEnd] = useState("");

	// weekly
	const [byWeekday, setByWeekday] = useState([]);
	const [timeStart, setTimeStart] = useState("");
	const [timeEnd, setTimeEnd] = useState("");
	const [startsOn, setStartsOn] = useState("");
	const [endsOn, setEndsOn] = useState("");

	// run
	const [runWeekday, setRunWeekday] = useState("TU");
	const [weeks, setWeeks] = useState(6);

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
			await createChurchEventAction(payload);
			toast.success("Created");
			router.push("/admin/church-events");
		} catch (err) {
			toast.error(err?.message || "Couldn't create.");
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
							onClick={() => setKind("weekly")}
							title="Weekly"
							blurb="Open-ended weekly pattern (e.g. Sunday morning service)."
						/>
						<KindCard
							active={kind === "run"}
							onClick={() => setKind("run")}
							title="Run"
							blurb="A finite weekly series (e.g. 6-week course)."
						/>
						<KindCard
							active={kind === "adhoc"}
							onClick={() => setKind("adhoc")}
							title="Adhoc"
							blurb="A one-off event on a specific day."
						/>
					</div>
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
							<Label htmlFor="starts-at">Starts</Label>
							<Input
								id="starts-at"
								type="datetime-local"
								value={adhocStart}
								onChange={(e) => setAdhocStart(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="ends-at">Ends</Label>
							<Input
								id="ends-at"
								type="datetime-local"
								value={adhocEnd}
								onChange={(e) => setAdhocEnd(e.target.value)}
								required
							/>
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
							<Label htmlFor="time-start">Start time</Label>
							<Input id="time-start" type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} required />
						</div>
						<div className="space-y-2">
							<Label htmlFor="time-end">End time</Label>
							<Input id="time-end" type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} required />
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="starts-on">Starts on</Label>
							<Input id="starts-on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
						</div>
						<div className="space-y-2">
							<Label htmlFor="ends-on">Ends on (optional)</Label>
							<Input id="ends-on" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
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
							<Label htmlFor="run-weekday">Weekday</Label>
							<select
								id="run-weekday"
								value={runWeekday}
								onChange={(e) => setRunWeekday(e.target.value)}
								className="w-full h-9 rounded-md border border-foreground/15 bg-background px-3 text-sm"
							>
								{WEEKDAYS.map((d) => (
									<option key={d.key} value={d.key}>
										{d.label}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="time-start">Start time</Label>
							<Input id="time-start" type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} required />
						</div>
						<div className="space-y-2">
							<Label htmlFor="time-end">End time</Label>
							<Input id="time-end" type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} required />
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="starts-on">First week starting</Label>
							<Input id="starts-on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
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
							Off by default — admin-only.
						</span>
					</span>
				</label>
			</section>

			<div className="flex items-center justify-end gap-3">
				<Button type="submit" disabled={saving}>
					{saving ? "Saving…" : "Create"}
				</Button>
			</div>
		</form>
	);
}

function KindCard({ active, onClick, title, blurb }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`text-left rounded-lg border px-4 py-4 transition ${
				active
					? "border-primary bg-primary/5"
					: "border-foreground/10 hover:border-foreground/30 bg-background"
			}`}
		>
			<div className="font-medium">{title}</div>
			<p className="text-xs text-muted-foreground mt-1">{blurb}</p>
		</button>
	);
}
