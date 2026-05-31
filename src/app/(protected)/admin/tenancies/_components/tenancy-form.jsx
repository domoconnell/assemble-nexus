"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Textarea } from "@/shadcn/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/shadcn/components/ui/select";
import { DatePicker } from "@/site/booking/date-picker";
import { createTenancyAction, updateTenancyAction } from "../actions";
import SchedulesEditor from "./schedules-editor";

function normaliseSchedule(raw) {
	if (Array.isArray(raw)) return raw;
	if (raw && typeof raw === "object" && raw.by_weekday) {
		return [{
			id:
				typeof crypto !== "undefined" && crypto.randomUUID
					? crypto.randomUUID()
					: `r_${Math.random().toString(36).slice(2, 10)}`,
			kind: "weekly",
			by_weekday: raw.by_weekday,
			interval: 1,
			time_start: raw.time_start ?? "",
			time_end: raw.time_end ?? "",
			per_session_rate_cents: null,
			label: "",
		}];
	}
	return [];
}

function toPounds(cents) {
	if (cents == null) return "";
	return (cents / 100).toString();
}

function toCents(pounds) {
	const n = Number(pounds);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(n * 100);
}

export default function TenancyForm({ organisations, rooms, initial = null }) {
	const router = useRouter();
	const isEdit = !!initial;

	const [kind, setKind] = useState(initial?.kind ?? "private_rental");
	const [organisationId, setOrganisationId] = useState(initial?.organisation_id ?? "");
	const [roomId, setRoomId] = useState(initial?.room_id ?? "");
	const [label, setLabel] = useState(initial?.label ?? "");
	const [startsOn, setStartsOn] = useState(initial?.starts_on ?? "");
	const [endsOn, setEndsOn] = useState(initial?.ends_on ?? "");
	const [invoiceDay, setInvoiceDay] = useState(initial?.invoice_day_of_month ?? 1);
	const [monthlyRate, setMonthlyRate] = useState(toPounds(initial?.monthly_rate_cents));
	const [schedules, setSchedules] = useState(normaliseSchedule(initial?.schedule_rule));
	const [monthlyOverride, setMonthlyOverride] = useState(toPounds(initial?.monthly_override_cents));
	const [notes, setNotes] = useState(initial?.notes ?? "");
	const [saving, setSaving] = useState(false);

	// Mutually-exclusive open state. Radix Select's outside-click detection
	// doesn't reliably dismiss a sibling Select when its trigger is clicked,
	// so we coordinate "which one's open" explicitly via this key.
	const [openSelect, setOpenSelect] = useState(null);
	const selectOpen = (key) => (v) => setOpenSelect(v ? key : (openSelect === key ? null : openSelect));

	async function submit(e) {
		e.preventDefault();
		if (!organisationId || !roomId || !startsOn) {
			toast.error("Organisation, room and start date are required.");
			return;
		}
		if (kind === "scheduled_recurring") {
			if (schedules.length === 0) {
				toast.error("Add at least one schedule.");
				return;
			}
			for (const r of schedules) {
				if ((r.by_weekday ?? []).length === 0) {
					toast.error("Every schedule needs at least one weekday.");
					return;
				}
				if (!r.time_start || !r.time_end) {
					toast.error("Every schedule needs a start and end time.");
					return;
				}
				if (r.per_session_rate_cents == null) {
					toast.error("Every schedule needs a per-session rate.");
					return;
				}
				if (r.kind === "monthly_nth" && (r.by_set_pos ?? []).length === 0) {
					toast.error("Monthly schedules need at least one position picked (1st, 2nd, …).");
					return;
				}
			}
		}
		setSaving(true);
		try {
			const payload = {
				kind,
				organisation_id: organisationId,
				room_id: roomId,
				label: label || null,
				starts_on: startsOn,
				ends_on: endsOn || null,
				invoice_day_of_month: Number(invoiceDay),
				monthly_rate_cents: kind === "private_rental" ? toCents(monthlyRate) : null,
				schedule_rule: kind === "scheduled_recurring" ? schedules : null,
				monthly_override_cents:
					kind === "scheduled_recurring" ? toCents(monthlyOverride) : null,
				notes: notes || null,
			};
			if (isEdit) {
				await updateTenancyAction({
					id: initial.id,
					label: payload.label,
					ends_on: payload.ends_on,
					invoice_day_of_month: payload.invoice_day_of_month,
					monthly_rate_cents: payload.monthly_rate_cents,
					schedule_rule: payload.schedule_rule,
					monthly_override_cents: payload.monthly_override_cents,
					notes: payload.notes,
				});
				toast.success("Saved");
				router.refresh();
			} else {
				const { id } = await createTenancyAction(payload);
				toast.success("Tenancy created");
				router.push(`/admin/tenancies/${id}`);
			}
		} catch (err) {
			toast.error(err?.message || "Save failed.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={submit} className="space-y-6">
			<section className="rounded-lg border bg-card p-6 space-y-5">
				<div className="space-y-2">
					<Label>Tenancy kind</Label>
					<div className="grid gap-3 sm:grid-cols-2">
						<KindCard
							active={kind === "private_rental"}
							disabled={isEdit}
							onClick={() => setKind("private_rental")}
							title="Private rental"
							blurb="Flat monthly fee. The room is exclusively the customer's. Usually a private, non-public room."
						/>
						<KindCard
							active={kind === "scheduled_recurring"}
							disabled={isEdit}
							onClick={() => setKind("scheduled_recurring")}
							title="Scheduled recurring"
							blurb="Customer uses a public room on a weekly pattern. Billed per session each month, cancellations reduce the invoice."
						/>
					</div>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="organisation">Organisation</Label>
						<Select
							value={organisationId}
							onValueChange={setOrganisationId}
							disabled={isEdit}
							open={openSelect === "org"}
							onOpenChange={selectOpen("org")}
						>
							<SelectTrigger id="organisation">
								<SelectValue placeholder="Choose an organisation" />
							</SelectTrigger>
							<SelectContent>
								{organisations.length === 0 ? (
									<div className="px-2 py-1.5 text-sm text-muted-foreground">
										No organisations yet - add one in CRM.
									</div>
								) : (
									organisations.map((o) => (
										<SelectItem key={o.id} value={o.id}>
											{o.name}
											{o.primary_contact_name && (
												<span className="text-muted-foreground">
													{" · "}
													{o.primary_contact_name}
												</span>
											)}
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="room">Room</Label>
						<Select
							value={roomId}
							onValueChange={setRoomId}
							disabled={isEdit}
							open={openSelect === "room"}
							onOpenChange={selectOpen("room")}
						>
							<SelectTrigger id="room">
								<SelectValue placeholder="Choose a room" />
							</SelectTrigger>
							<SelectContent>
								{(() => {
									const privateRooms = rooms.filter((r) => r.is_public === false);
									const publicRooms = rooms.filter((r) => r.is_public !== false);
									return (
										<>
											{privateRooms.length > 0 && (
												<SelectGroup>
													<SelectLabel>Non-public rooms</SelectLabel>
													{privateRooms.map((r) => (
														<SelectItem key={r.id} value={r.id}>
															{r.name}
															{!r.is_published && (
																<span className="text-muted-foreground"> · unpublished</span>
															)}
														</SelectItem>
													))}
												</SelectGroup>
											)}
											{privateRooms.length > 0 && publicRooms.length > 0 && <SelectSeparator />}
											{publicRooms.length > 0 && (
												<SelectGroup>
													<SelectLabel>Public rooms</SelectLabel>
													{publicRooms.map((r) => (
														<SelectItem key={r.id} value={r.id}>
															{r.name}
															{!r.is_published && (
																<span className="text-muted-foreground"> · unpublished</span>
															)}
														</SelectItem>
													))}
												</SelectGroup>
											)}
										</>
									);
								})()}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="label">Label (optional)</Label>
					<Input
						id="label"
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						placeholder="e.g. WebWorks office tenancy"
						maxLength={200}
					/>
				</div>
			</section>

			<section className="rounded-lg border bg-card p-6 space-y-5">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Dates & invoicing
				</h2>
				<div className="grid gap-4 sm:grid-cols-3">
					<div className="space-y-2">
						<Label>Starts on</Label>
						<DatePicker
							value={startsOn}
							onChange={setStartsOn}
							placeholder="Pick a date"
							allowPast
						/>
					</div>
					<div className="space-y-2">
						<Label>Ends on (optional)</Label>
						<DatePicker
							value={endsOn}
							onChange={setEndsOn}
							placeholder="Open-ended"
							allowPast
						/>
						<p className="text-[10px] text-muted-foreground">
							Leave blank for an ongoing tenancy.
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="invoice-day">Invoice day of month</Label>
						<Input
							id="invoice-day"
							type="number"
							min={1}
							max={28}
							value={invoiceDay}
							onChange={(e) => setInvoiceDay(e.target.value)}
						/>
						<p className="text-[10px] text-muted-foreground">1-28; capped at 28 so it lands every month.</p>
					</div>
				</div>
			</section>

			{kind === "private_rental" ? (
				<section className="rounded-lg border bg-card p-6 space-y-3">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Monthly rate
					</h2>
					<div className="space-y-2 max-w-sm">
						<Label htmlFor="monthly-rate">Monthly rate (£)</Label>
						<Input
							id="monthly-rate"
							type="number"
							min={0}
							step="0.01"
							value={monthlyRate}
							onChange={(e) => setMonthlyRate(e.target.value)}
							placeholder="e.g. 450"
							required
						/>
					</div>
				</section>
			) : (
				<>
					<section className="rounded-lg border bg-card p-6 space-y-4">
						<div className="flex items-baseline justify-between gap-3 flex-wrap">
							<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
								Schedules
							</h2>
							<p className="text-[11px] text-muted-foreground max-w-md">
								One tenancy can run multiple recurring schedules - e.g. Mon
								mornings AND the 1st & 3rd Sat of the month. Each schedule
								has its own rate and shows as its own line on the invoice.
							</p>
						</div>
						<SchedulesEditor value={schedules} onChange={setSchedules} />
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-3">
						<div className="flex items-baseline justify-between gap-3 flex-wrap">
							<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
								Fixed monthly total (override)
							</h2>
							<p className="text-[11px] text-muted-foreground max-w-md">
								Optional. When set, every invoice is this exact amount no
								matter how many sessions fall in the month. The would-have-
								been sum is shown on the invoice as a transparent adjustment.
							</p>
						</div>
						<div className="space-y-2 max-w-sm">
							<Label htmlFor="monthly-override">Fixed monthly total (£)</Label>
							<Input
								id="monthly-override"
								type="number"
								min={0}
								step="0.01"
								value={monthlyOverride}
								onChange={(e) => setMonthlyOverride(e.target.value)}
								placeholder="Leave blank to bill per session"
							/>
						</div>
					</section>
				</>
			)}

			<section className="rounded-lg border bg-card p-6 space-y-3">
				<div className="space-y-2">
					<Label htmlFor="notes">Notes (internal)</Label>
					<Textarea
						id="notes"
						rows={3}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder="Anything the team should know - discounts, access notes, etc."
					/>
				</div>
			</section>

			<div className="flex items-center justify-end gap-3">
				<Button type="submit" disabled={saving}>
					{saving ? "Saving…" : isEdit ? "Save changes" : "Create tenancy"}
				</Button>
			</div>
		</form>
	);
}

function KindCard({ active, disabled, onClick, title, blurb }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`text-left rounded-lg border px-4 py-4 transition ${
				active
					? "border-primary bg-primary/5"
					: "border-foreground/10 hover:border-foreground/30 bg-background"
			} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
		>
			<div className="font-medium">{title}</div>
			<p className="text-xs text-muted-foreground mt-1">{blurb}</p>
		</button>
	);
}
