"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Label } from "@/shadcn/components/ui/label";
import { Checkbox } from "@/shadcn/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shadcn/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/shadcn/components/ui/dialog";
import { ScrollArea } from "@/shadcn/components/ui/scroll-area";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import {
	saveBlockoutAction,
	deleteBlockoutAction,
	deleteBlockoutSeriesAction,
} from "./actions";

const stampFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

const WEEKDAYS = [
	{ value: 0, label: "Sunday" },
	{ value: 1, label: "Monday" },
	{ value: 2, label: "Tuesday" },
	{ value: 3, label: "Wednesday" },
	{ value: 4, label: "Thursday" },
	{ value: 5, label: "Friday" },
	{ value: 6, label: "Saturday" },
];

const POSITIONS = [
	{ value: 1, label: "First" },
	{ value: 2, label: "Second" },
	{ value: 3, label: "Third" },
	{ value: 4, label: "Fourth" },
	{ value: -1, label: "Last" },
];

function toLocalInput(date) {
	if (!date) return "";
	const d = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(d.valueOf())) return "";
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function weekdayPositionInMonth(date) {
	const d = date instanceof Date ? date : new Date(date);
	const weekday = d.getDay();
	const dayOfMonth = d.getDate();
	const position = Math.ceil(dayOfMonth / 7);
	const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
	const isLast = dayOfMonth + 7 > lastOfMonth;
	return { weekday, position: isLast ? -1 : position };
}

function emptyDraft() {
	const now = new Date();
	const start = new Date(now);
	start.setHours(start.getHours() + 1, 0, 0, 0);
	const end = new Date(start);
	end.setHours(end.getHours() + 2);
	const { weekday, position } = weekdayPositionInMonth(start);
	return {
		id: null,
		series_id: null,
		room_ids: [],
		starts_at: toLocalInput(start),
		ends_at: toLocalInput(end),
		reason: "",
		notes: "",
		is_public: false,
		recurring: false,
		apply_to_series: false,
		pattern_kind: "weekly",
		interval: 1,
		day_of_month: start.getDate(),
		weekday,
		position,
		limit_kind: "count",
		count: 12,
		until_date: "",
	};
}

function summariseRooms(blockoutRooms, allRoomsCount) {
	if (!blockoutRooms?.length) return <span className="text-muted-foreground italic">All rooms</span>;
	if (blockoutRooms.length === allRoomsCount && allRoomsCount > 0) {
		return <span className="text-muted-foreground italic">All rooms</span>;
	}
	return blockoutRooms.map((r) => r.name).join(", ");
}

export default function BlockoutsClient({ blockouts, rooms }) {
	const [pending, startTransition] = useTransition();
	const [editing, setEditing] = useState(null);
	const [confirmId, setConfirmId] = useState(null);
	const [confirmSeries, setConfirmSeries] = useState(null);

	const seriesSize = useMemo(() => {
		const counts = new Map();
		for (const b of blockouts) {
			if (!b.series_id) continue;
			counts.set(b.series_id, (counts.get(b.series_id) ?? 0) + 1);
		}
		return counts;
	}, [blockouts]);

	function openNew() {
		setEditing(emptyDraft());
	}

	function openEdit(row) {
		const startDate = new Date(row.starts_at);
		const { weekday, position } = weekdayPositionInMonth(startDate);
		setEditing({
			id: row.id,
			series_id: row.series_id ?? null,
			room_ids: row.rooms?.map((r) => r.id) ?? [],
			starts_at: toLocalInput(row.starts_at),
			ends_at: toLocalInput(row.ends_at),
			reason: row.reason ?? "",
			notes: row.notes ?? "",
			is_public: !!row.is_public,
			recurring: !!row.series_id,
			apply_to_series: false,
			pattern_kind: "weekly",
			interval: 1,
			day_of_month: startDate.getDate(),
			weekday,
			position,
			limit_kind: "count",
			count: 12,
			until_date: "",
		});
	}

	function toggleRoom(roomId, checked) {
		setEditing((prev) => {
			const current = new Set(prev.room_ids ?? []);
			if (checked) current.add(roomId);
			else current.delete(roomId);
			return { ...prev, room_ids: [...current] };
		});
	}

	function buildRecurrencePayload(draft) {
		if (!draft.recurring) return null;
		const base = {
			kind: draft.pattern_kind,
			interval: Number(draft.interval) || 1,
			count: draft.limit_kind === "count" ? Number(draft.count) || null : null,
			until_date: draft.limit_kind === "until" ? draft.until_date || null : null,
		};
		if (draft.pattern_kind === "monthly_day") {
			base.day_of_month = Number(draft.day_of_month);
		}
		if (draft.pattern_kind === "monthly_weekday") {
			base.weekday = Number(draft.weekday);
			base.position = Number(draft.position);
		}
		return base;
	}

	function save(e) {
		e?.preventDefault();
		if (!editing) return;
		const recurrence = buildRecurrencePayload(editing);

		startTransition(async () => {
			try {
				const result = await saveBlockoutAction({
					id: editing.id,
					room_ids: editing.room_ids,
					starts_at: new Date(editing.starts_at).toISOString(),
					ends_at: new Date(editing.ends_at).toISOString(),
					reason: editing.reason,
					notes: editing.notes || null,
					is_public: editing.is_public,
					recurrence,
					apply_to_series: editing.apply_to_series,
				});
				if (editing.id) {
					toast.success(
						result.regenerated
							? `Updated · regenerated ${result.regenerated} future occurrence${result.regenerated === 1 ? "" : "s"}`
							: "Blockout updated",
					);
				} else if ((result.added ?? 1) > 1) {
					toast.success(`Created ${result.added} recurring blockouts`);
				} else {
					toast.success("Blockout added");
				}
				setEditing(null);
			} catch (err) {
				toast.error(err?.message || "Couldn't save");
			}
		});
	}

	function remove(id) {
		startTransition(async () => {
			try {
				await deleteBlockoutAction(id);
				toast.success("Removed");
			} catch (err) {
				toast.error(err?.message || "Couldn't remove");
			}
			setConfirmId(null);
		});
	}

	function removeSeries(seriesId) {
		startTransition(async () => {
			try {
				await deleteBlockoutSeriesAction(seriesId);
				toast.success("Series removed");
			} catch (err) {
				toast.error(err?.message || "Couldn't remove");
			}
			setConfirmSeries(null);
		});
	}

	return (
		<>
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<span className="text-sm text-muted-foreground">
					{blockouts.length} active or upcoming
				</span>
				<Button onClick={openNew}>Add blockout</Button>
			</div>

			{blockouts.length === 0 ? (
				<div className="rounded-lg border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
					No active blockouts. Add one when a room is unavailable.
				</div>
			) : (
				<div className="rounded-lg border bg-card overflow-hidden">
					<table className="w-full text-sm">
						<thead className="bg-muted/40">
							<tr className="text-left">
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">
									Rooms
								</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">
									From
								</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">
									Until
								</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">
									Reason
								</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">
									Visibility
								</th>
								<th className="px-2 py-2" />
							</tr>
						</thead>
						<tbody>
							{blockouts.map((b) => {
								const inSeries = b.series_id ? seriesSize.get(b.series_id) ?? 0 : 0;
								return (
									<tr key={b.id} className="border-t border-foreground/5">
										<td className="px-4 py-2">{summariseRooms(b.rooms, rooms.length)}</td>
										<td className="px-4 py-2 whitespace-nowrap">{stampFmt.format(new Date(b.starts_at))}</td>
										<td className="px-4 py-2 whitespace-nowrap">{stampFmt.format(new Date(b.ends_at))}</td>
										<td className="px-4 py-2">
											<div className="flex items-baseline gap-2 flex-wrap">
												<span>{b.reason}</span>
												{inSeries > 1 && (
													<span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground border rounded px-1.5 py-0.5">
														Recurring · {inSeries}
													</span>
												)}
											</div>
											{b.notes && <div className="text-xs text-muted-foreground mt-0.5">{b.notes}</div>}
										</td>
										<td className="px-4 py-2 text-xs text-muted-foreground">
											{b.is_public ? "Public" : "Admin only"}
										</td>
										<td className="px-2 py-2 whitespace-nowrap text-right">
											<Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
												Edit
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setConfirmId(b.id)}
												disabled={pending}
											>
												Remove
											</Button>
											{inSeries > 1 && (
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setConfirmSeries(b.series_id)}
													disabled={pending}
												>
													Remove series
												</Button>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			<Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
				<DialogContent className="p-0 max-w-lg gap-0">
					<DialogHeader className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 space-y-1.5">
						<DialogTitle>{editing?.id ? "Edit blockout" : "Add blockout"}</DialogTitle>
						<DialogDescription>
							{editing?.id
								? "Edits apply to this occurrence by default. Toggle 'Apply to series' to regenerate future occurrences too."
								: "Block one or more rooms across a date range. Toggle 'Repeat' for a recurring series."}
						</DialogDescription>
					</DialogHeader>
					{editing && (
						<ScrollArea className="max-h-[70vh] *:data-radix-scroll-area-viewport:max-h-[70vh] scroll-shadow">
							<form onSubmit={save} className="space-y-4 px-6 sm:px-8 pb-6 sm:pb-8">
							<div className="space-y-2">
								<div className="flex items-baseline justify-between">
									<Label>Rooms</Label>
									<div className="flex gap-3">
										<button
											type="button"
											className="text-xs text-muted-foreground hover:text-foreground underline"
											onClick={() => setEditing({ ...editing, room_ids: rooms.map((r) => r.id) })}
										>
											Select all
										</button>
										<button
											type="button"
											className="text-xs text-muted-foreground hover:text-foreground underline"
											onClick={() => setEditing({ ...editing, room_ids: [] })}
										>
											Clear
										</button>
									</div>
								</div>
								<ScrollArea className="rounded-md border bg-background max-h-40 *:data-radix-scroll-area-viewport:max-h-40">
									<div className="p-3 space-y-2">
										{rooms.map((r) => {
											const checked = editing.room_ids.includes(r.id);
											return (
												<label key={r.id} className="flex items-center gap-2 cursor-pointer">
													<Checkbox
														checked={checked}
														onCheckedChange={(v) => toggleRoom(r.id, !!v)}
													/>
													<span className="text-sm">{r.name}</span>
												</label>
											);
										})}
									</div>
								</ScrollArea>
								<p className="text-xs text-muted-foreground">
									Leave empty to block every room (venue-wide closure).
								</p>
							</div>

							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label htmlFor="bo-start">From</Label>
									<Input
										id="bo-start"
										type="datetime-local"
										value={editing.starts_at}
										onChange={(e) => setEditing({ ...editing, starts_at: e.target.value })}
										required
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="bo-end">Until</Label>
									<Input
										id="bo-end"
										type="datetime-local"
										value={editing.ends_at}
										onChange={(e) => setEditing({ ...editing, ends_at: e.target.value })}
										required
									/>
								</div>
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="bo-reason">Reason</Label>
								<Input
									id="bo-reason"
									value={editing.reason}
									onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
									placeholder="Maintenance, Private event, Holiday…"
									required
								/>
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="bo-notes">Internal notes (optional)</Label>
								<Textarea
									id="bo-notes"
									value={editing.notes}
									onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
									rows={2}
								/>
							</div>

							<div className="flex items-center gap-2">
								<Checkbox
									id="bo-public"
									checked={editing.is_public}
									onCheckedChange={(v) => setEditing({ ...editing, is_public: !!v })}
								/>
								<Label htmlFor="bo-public" className="font-normal">
									Show on the public availability calendar
								</Label>
							</div>

							<div className="space-y-3 border-t border-foreground/10 pt-4">
								<div className="flex items-center gap-2">
									<Checkbox
										id="bo-recurring"
										checked={editing.recurring}
										onCheckedChange={(v) => setEditing({ ...editing, recurring: !!v })}
									/>
									<Label htmlFor="bo-recurring" className="font-normal">
										Repeat on a schedule
									</Label>
								</div>

								{editing.recurring && (
									<div className="space-y-3 pl-6">
										<div className="space-y-1.5">
											<Label>Pattern</Label>
											<Select
												value={editing.pattern_kind}
												onValueChange={(v) => setEditing({ ...editing, pattern_kind: v })}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="weekly">Weekly</SelectItem>
													<SelectItem value="monthly_day">Monthly - on a specific date</SelectItem>
													<SelectItem value="monthly_weekday">
														Monthly - on a specific weekday
													</SelectItem>
												</SelectContent>
											</Select>
										</div>

										<div className="space-y-1.5">
											<Label htmlFor="bo-interval">Every</Label>
											<div className="flex items-center gap-2">
												<Input
													id="bo-interval"
													type="number"
													min="1"
													max="12"
													value={editing.interval}
													onChange={(e) => setEditing({ ...editing, interval: e.target.value })}
													className="w-20"
												/>
												<span className="text-sm">
													{editing.pattern_kind === "weekly" ? "week(s)" : "month(s)"}
												</span>
											</div>
										</div>

										{editing.pattern_kind === "monthly_day" && (
											<div className="space-y-1.5">
												<Label htmlFor="bo-dom">Day of the month</Label>
												<div className="flex items-center gap-2">
													<Input
														id="bo-dom"
														type="number"
														min="1"
														max="31"
														value={editing.day_of_month}
														onChange={(e) => setEditing({ ...editing, day_of_month: e.target.value })}
														className="w-20"
													/>
													<span className="text-xs text-muted-foreground">
														(months without this day are skipped)
													</span>
												</div>
											</div>
										)}

										{editing.pattern_kind === "monthly_weekday" && (
											<div className="grid gap-2 sm:grid-cols-2">
												<div className="space-y-1.5">
													<Label>Position</Label>
													<Select
														value={String(editing.position)}
														onValueChange={(v) => setEditing({ ...editing, position: Number(v) })}
													>
														<SelectTrigger>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{POSITIONS.map((p) => (
																<SelectItem key={p.value} value={String(p.value)}>
																	{p.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
												<div className="space-y-1.5">
													<Label>Weekday</Label>
													<Select
														value={String(editing.weekday)}
														onValueChange={(v) => setEditing({ ...editing, weekday: Number(v) })}
													>
														<SelectTrigger>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{WEEKDAYS.map((d) => (
																<SelectItem key={d.value} value={String(d.value)}>
																	{d.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
											</div>
										)}

										<div className="space-y-1.5">
											<Label>Until</Label>
											<div className="flex gap-3">
												<label className="flex items-center gap-1.5 text-sm">
													<input
														type="radio"
														name="bo-limit-kind"
														value="count"
														checked={editing.limit_kind === "count"}
														onChange={() => setEditing({ ...editing, limit_kind: "count" })}
													/>
													Number of occurrences
												</label>
												<label className="flex items-center gap-1.5 text-sm">
													<input
														type="radio"
														name="bo-limit-kind"
														value="until"
														checked={editing.limit_kind === "until"}
														onChange={() => setEditing({ ...editing, limit_kind: "until" })}
													/>
													Date
												</label>
											</div>
											{editing.limit_kind === "count" ? (
												<div className="flex items-center gap-2 pt-1">
													<Input
														type="number"
														min="2"
														max="156"
														value={editing.count}
														onChange={(e) => setEditing({ ...editing, count: e.target.value })}
														className="w-24"
													/>
													<span className="text-sm">total (including the first)</span>
												</div>
											) : (
												<Input
													type="date"
													value={editing.until_date}
													onChange={(e) => setEditing({ ...editing, until_date: e.target.value })}
												/>
											)}
										</div>

										{editing.id && (
											<div className="flex items-start gap-2 pt-1 border-t border-foreground/5">
												<Checkbox
													id="bo-apply-series"
													checked={editing.apply_to_series}
													onCheckedChange={(v) =>
														setEditing({ ...editing, apply_to_series: !!v })
													}
												/>
												<div>
													<Label htmlFor="bo-apply-series" className="font-normal">
														Apply pattern to this and future occurrences
													</Label>
													<p className="text-xs text-muted-foreground">
														Removes any future occurrences after this one and regenerates them
														using the pattern above. Past occurrences are left alone.
													</p>
												</div>
											</div>
										)}
									</div>
								)}
							</div>

							<div className="flex justify-end gap-2 pt-2">
								<Button type="button" variant="ghost" onClick={() => setEditing(null)}>
									Cancel
								</Button>
								<Button type="submit" disabled={pending}>
									{pending ? "Saving…" : editing.id ? "Save changes" : "Add blockout"}
								</Button>
							</div>
							</form>
						</ScrollArea>
					)}
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={!!confirmId}
				onOpenChange={(open) => !open && setConfirmId(null)}
				title="Remove this blockout?"
				description="Only this occurrence is removed."
				confirmLabel="Remove"
				destructive
				onConfirm={() => confirmId && remove(confirmId)}
			/>

			<ConfirmDialog
				open={!!confirmSeries}
				onOpenChange={(open) => !open && setConfirmSeries(null)}
				title="Remove the whole series?"
				description="Every occurrence in this recurring series will be removed."
				confirmLabel="Remove series"
				destructive
				onConfirm={() => confirmSeries && removeSeries(confirmSeries)}
			/>
		</>
	);
}
