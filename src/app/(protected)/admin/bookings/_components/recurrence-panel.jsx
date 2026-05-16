"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
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
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import {
	addRecurringSegmentsAction,
	cancelBookingSegmentAction,
} from "../actions";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const POSITION_LABELS = { 1: "first", 2: "second", 3: "third", 4: "fourth", "-1": "last" };

function fmtSummary(rule) {
	if (!rule) return null;
	const i = rule.interval ?? 1;
	let cadence = "";
	if (rule.kind === "weekly") {
		cadence = i === 1 ? "weekly" : i === 2 ? "every 2 weeks" : `every ${i} weeks`;
	} else if (rule.kind === "monthly_day") {
		const dom = rule.day_of_month ?? "?";
		const every = i === 1 ? "monthly" : `every ${i} months`;
		cadence = `${every} on the ${dom}${ordinalSuffix(dom)}`;
	} else if (rule.kind === "monthly_weekday") {
		const pos = POSITION_LABELS[String(rule.position)] ?? "?";
		const wd = WEEKDAY_LABELS[rule.weekday] ?? "?";
		const every = i === 1 ? "monthly" : `every ${i} months`;
		cadence = `${every} on the ${pos} ${wd}`;
	} else {
		cadence = "on a schedule";
	}
	const limit = rule.count
		? `${rule.count} occurrences`
		: rule.until_date
			? `until ${rule.until_date}`
			: "";
	return `Recurring ${cadence}${limit ? ", " + limit : ""}`;
}

function ordinalSuffix(n) {
	const v = n % 100;
	if (v >= 11 && v <= 13) return "th";
	switch (n % 10) {
		case 1: return "st";
		case 2: return "nd";
		case 3: return "rd";
		default: return "th";
	}
}

export default function RecurrencePanel({
	bookingId,
	bookingStatus,
	segments,
	rule = null,
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [confirmId, setConfirmId] = useState(null);
	const [pending, startTransition] = useTransition();
	const templateDefault = segments[0];
	const [form, setForm] = useState({
		template_segment_id: templateDefault?.id ?? "",
		kind: "weekly",
		interval: 1,
		limit_kind: "count",
		count: 12,
		until_date: "",
		day_of_month: templateDefault?.starts_at
			? new Date(templateDefault.starts_at).getDate()
			: 1,
		weekday: templateDefault?.starts_at
			? new Date(templateDefault.starts_at).getDay()
			: 1,
		position: templateDefault?.starts_at
			? Math.min(4, Math.ceil(new Date(templateDefault.starts_at).getDate() / 7))
			: 1,
	});

	const canAddRecurrence = bookingStatus === "pending" || bookingStatus === "approved";
	const activeSegments = segments.filter((s) => !s.deletedAt);

	function submit(e) {
		e?.preventDefault();
		if (!form.template_segment_id) {
			toast.error("Pick a segment to use as the template.");
			return;
		}
		startTransition(async () => {
			try {
				const result = await addRecurringSegmentsAction({
					booking_id: bookingId,
					template_segment_id: form.template_segment_id,
					kind: form.kind,
					interval: Number(form.interval) || 1,
					count: form.limit_kind === "count" ? Number(form.count) || null : null,
					until_date: form.limit_kind === "until" ? form.until_date || null : null,
					day_of_month: form.kind === "monthly_day" ? Number(form.day_of_month) || null : null,
					weekday: form.kind === "monthly_weekday" ? Number(form.weekday) : null,
					position: form.kind === "monthly_weekday" ? Number(form.position) : null,
				});
				toast.success(
					`Added ${result.added} occurrence${result.added === 1 ? "" : "s"}` +
						(result.skipped?.length ? ` · ${result.skipped.length} skipped (conflicts)` : ""),
				);
				setOpen(false);
				router.refresh();
			} catch (err) {
				toast.error(err?.message || "Couldn't add recurrence");
			}
		});
	}

	function cancelSegment(segmentId) {
		startTransition(async () => {
			try {
				await cancelBookingSegmentAction({ booking_id: bookingId, segment_id: segmentId });
				toast.success("Occurrence cancelled");
				router.refresh();
			} catch (err) {
				toast.error(err?.message || "Couldn't cancel");
			}
			setConfirmId(null);
		});
	}

	return (
		<section className="rounded-lg border bg-card p-6 space-y-4">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div>
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
						Recurrence
					</h2>
					{rule && <p className="text-xs text-muted-foreground mt-1">{fmtSummary(rule)}</p>}
				</div>
				{canAddRecurrence && (
					<Button size="sm" onClick={() => setOpen(true)} disabled={!segments.length}>
						{rule ? "Add more occurrences" : "Make recurring"}
					</Button>
				)}
			</div>

			{activeSegments.length > 1 && (
				<ul className="space-y-1.5 text-sm border-t border-foreground/10 pt-4">
					{activeSegments.map((s) => (
						<li key={s.id} className="flex items-baseline justify-between gap-3">
							<span className="text-muted-foreground">
								{dateFmt.format(new Date(s.starts_at))}
							</span>
							{canAddRecurrence && activeSegments.length > 1 && (
								<Button
									size="sm"
									variant="ghost"
									onClick={() => setConfirmId(s.id)}
									disabled={pending}
								>
									Skip
								</Button>
							)}
						</li>
					))}
				</ul>
			)}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="p-6 sm:p-8 space-y-5 max-w-lg">
					<DialogHeader>
						<DialogTitle>Generate recurring occurrences</DialogTitle>
						<DialogDescription>
							Pick one segment as the template - its date, time, room and price are
							copied to the new occurrences. Conflicts with existing bookings, events,
							or blockouts are skipped automatically.
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={submit} className="space-y-4">
						<div className="space-y-1.5">
							<Label>Template segment</Label>
							<Select
								value={form.template_segment_id}
								onValueChange={(v) => setForm({ ...form, template_segment_id: v })}
							>
								<SelectTrigger>
									<SelectValue placeholder="Pick a segment" />
								</SelectTrigger>
								<SelectContent>
									{activeSegments.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{dateFmt.format(new Date(s.starts_at))}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label>Pattern</Label>
							<Select
								value={form.kind}
								onValueChange={(v) => setForm({ ...form, kind: v })}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="weekly">Weekly</SelectItem>
									<SelectItem value="monthly_day">Monthly · same date</SelectItem>
									<SelectItem value="monthly_weekday">Monthly · same weekday position</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="rec-interval">Repeat every</Label>
							<div className="flex items-center gap-2">
								<Input
									id="rec-interval"
									type="number"
									min="1"
									max={form.kind === "weekly" ? "8" : "12"}
									value={form.interval}
									onChange={(e) => setForm({ ...form, interval: e.target.value })}
									className="w-20"
								/>
								<span className="text-sm">
									{form.kind === "weekly" ? "week(s)" : "month(s)"}
								</span>
							</div>
						</div>
						{form.kind === "monthly_day" && (
							<div className="space-y-1.5">
								<Label htmlFor="rec-dom">Day of month</Label>
								<Input
									id="rec-dom"
									type="number"
									min="1"
									max="31"
									value={form.day_of_month}
									onChange={(e) => setForm({ ...form, day_of_month: e.target.value })}
									className="w-24"
								/>
								<p className="text-[11px] text-muted-foreground">
									Months without that day (e.g. Feb 30th) are skipped automatically.
								</p>
							</div>
						)}
						{form.kind === "monthly_weekday" && (
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1.5">
									<Label>Position</Label>
									<Select
										value={String(form.position)}
										onValueChange={(v) => setForm({ ...form, position: v })}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="1">First</SelectItem>
											<SelectItem value="2">Second</SelectItem>
											<SelectItem value="3">Third</SelectItem>
											<SelectItem value="4">Fourth</SelectItem>
											<SelectItem value="-1">Last</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1.5">
									<Label>Weekday</Label>
									<Select
										value={String(form.weekday)}
										onValueChange={(v) => setForm({ ...form, weekday: v })}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{WEEKDAY_LABELS.map((w, i) => (
												<SelectItem key={i} value={String(i)}>
													{w}
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
										name="limit_kind"
										value="count"
										checked={form.limit_kind === "count"}
										onChange={() => setForm({ ...form, limit_kind: "count" })}
									/>
									Number of occurrences
								</label>
								<label className="flex items-center gap-1.5 text-sm">
									<input
										type="radio"
										name="limit_kind"
										value="until"
										checked={form.limit_kind === "until"}
										onChange={() => setForm({ ...form, limit_kind: "until" })}
									/>
									Date
								</label>
							</div>
							{form.limit_kind === "count" ? (
								<div className="flex items-center gap-2 pt-1">
									<Input
										type="number"
										min="2"
										max="156"
										value={form.count}
										onChange={(e) => setForm({ ...form, count: e.target.value })}
										className="w-24"
									/>
									<span className="text-sm">total (including the template)</span>
								</div>
							) : (
								<Input
									type="date"
									value={form.until_date}
									onChange={(e) => setForm({ ...form, until_date: e.target.value })}
								/>
							)}
						</div>
						<div className="flex justify-end gap-2 pt-2">
							<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={pending}>
								{pending ? "Generating…" : "Generate"}
							</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={!!confirmId}
				onOpenChange={(o) => !o && setConfirmId(null)}
				title="Skip this occurrence?"
				description="The booking's total and deposit will be recalculated. You can't undo this from the UI."
				confirmLabel="Skip"
				destructive
				onConfirm={() => confirmId && cancelSegment(confirmId)}
			/>
		</section>
	);
}
