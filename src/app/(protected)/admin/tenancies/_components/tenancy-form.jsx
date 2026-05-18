"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { createTenancyAction, updateTenancyAction } from "../actions";

const WEEKDAYS = [
	{ key: "MO", label: "Mon" },
	{ key: "TU", label: "Tue" },
	{ key: "WE", label: "Wed" },
	{ key: "TH", label: "Thu" },
	{ key: "FR", label: "Fri" },
	{ key: "SA", label: "Sat" },
	{ key: "SU", label: "Sun" },
];

function toPounds(cents) {
	if (cents == null) return "";
	return (cents / 100).toString();
}

function toCents(pounds) {
	const n = Number(pounds);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(n * 100);
}

/**
 * Tenancy form - used for both new and edit. Pass `initial` to pre-fill.
 * For "edit" mode the kind/customer/room are locked (changing them mid-
 * tenancy is messy; if needed, end the tenancy and start a new one).
 */
export default function TenancyForm({ customers, rooms, initial = null }) {
	const router = useRouter();
	const isEdit = !!initial;

	const [kind, setKind] = useState(initial?.kind ?? "private_rental");
	const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
	const [roomId, setRoomId] = useState(initial?.room_id ?? "");
	const [label, setLabel] = useState(initial?.label ?? "");
	const [startsOn, setStartsOn] = useState(initial?.starts_on ?? "");
	const [endsOn, setEndsOn] = useState(initial?.ends_on ?? "");
	const [invoiceDay, setInvoiceDay] = useState(initial?.invoice_day_of_month ?? 1);
	const [monthlyRate, setMonthlyRate] = useState(toPounds(initial?.monthly_rate_cents));
	const [perSessionRate, setPerSessionRate] = useState(toPounds(initial?.per_session_rate_cents));
	const [weekdays, setWeekdays] = useState(initial?.schedule_rule?.by_weekday ?? []);
	const [timeStart, setTimeStart] = useState(initial?.schedule_rule?.time_start ?? "");
	const [timeEnd, setTimeEnd] = useState(initial?.schedule_rule?.time_end ?? "");
	const [notes, setNotes] = useState(initial?.notes ?? "");
	const [saving, setSaving] = useState(false);

	function toggleWeekday(key) {
		setWeekdays((cur) =>
			cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
		);
	}

	async function submit(e) {
		e.preventDefault();
		if (!customerId || !roomId || !startsOn) {
			toast.error("Customer, room, and start date are required.");
			return;
		}
		setSaving(true);
		try {
			const payload = {
				kind,
				customer_id: customerId,
				room_id: roomId,
				label: label || null,
				starts_on: startsOn,
				ends_on: endsOn || null,
				invoice_day_of_month: Number(invoiceDay),
				monthly_rate_cents: kind === "private_rental" ? toCents(monthlyRate) : null,
				per_session_rate_cents:
					kind === "scheduled_recurring" ? toCents(perSessionRate) : null,
				schedule_rule:
					kind === "scheduled_recurring"
						? { by_weekday: weekdays, time_start: timeStart, time_end: timeEnd }
						: null,
				notes: notes || null,
			};
			if (isEdit) {
				await updateTenancyAction({
					id: initial.id,
					label: payload.label,
					ends_on: payload.ends_on,
					invoice_day_of_month: payload.invoice_day_of_month,
					monthly_rate_cents: payload.monthly_rate_cents,
					per_session_rate_cents: payload.per_session_rate_cents,
					schedule_rule: payload.schedule_rule,
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
						<Label htmlFor="customer">Customer</Label>
						<select
							id="customer"
							value={customerId}
							onChange={(e) => setCustomerId(e.target.value)}
							disabled={isEdit}
							required
							className="w-full h-9 rounded-md border border-foreground/15 bg-background px-3 text-sm"
						>
							<option value="">— select —</option>
							{customers.map((c) => (
								<option key={c.id} value={c.id}>
									{c.first_name} {c.last_name}
									{c.organisation ? ` · ${c.organisation}` : ""}
									{c.email ? ` (${c.email})` : ""}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="room">Room</Label>
						<select
							id="room"
							value={roomId}
							onChange={(e) => setRoomId(e.target.value)}
							disabled={isEdit}
							required
							className="w-full h-9 rounded-md border border-foreground/15 bg-background px-3 text-sm"
						>
							<option value="">— select —</option>
							{rooms.map((r) => (
								<option key={r.id} value={r.id}>
									{r.name}
									{!r.is_public ? " (private)" : ""}
									{!r.is_published ? " · unpublished" : ""}
								</option>
							))}
						</select>
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="label">Label (optional)</Label>
					<Input
						id="label"
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						placeholder="e.g. Sarah's pottery studio"
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
						<Label htmlFor="starts-on">Starts on</Label>
						<Input
							id="starts-on"
							type="date"
							value={startsOn}
							onChange={(e) => setStartsOn(e.target.value)}
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="ends-on">Ends on (optional)</Label>
						<Input
							id="ends-on"
							type="date"
							value={endsOn}
							onChange={(e) => setEndsOn(e.target.value)}
						/>
						<p className="text-[10px] text-muted-foreground">Leave blank for open-ended.</p>
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
						<p className="text-[10px] text-muted-foreground">1–28; we cap at 28 so it lands every month.</p>
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
				<section className="rounded-lg border bg-card p-6 space-y-5">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Schedule & rate
					</h2>
					<div className="space-y-2">
						<Label>Days of the week</Label>
						<div className="flex flex-wrap gap-2">
							{WEEKDAYS.map((d) => {
								const active = weekdays.includes(d.key);
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
					<div className="grid gap-4 sm:grid-cols-3">
						<div className="space-y-2">
							<Label htmlFor="time-start">Start time</Label>
							<Input
								id="time-start"
								type="time"
								value={timeStart}
								onChange={(e) => setTimeStart(e.target.value)}
								required={kind === "scheduled_recurring"}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="time-end">End time</Label>
							<Input
								id="time-end"
								type="time"
								value={timeEnd}
								onChange={(e) => setTimeEnd(e.target.value)}
								required={kind === "scheduled_recurring"}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="per-session-rate">Per-session rate (£)</Label>
							<Input
								id="per-session-rate"
								type="number"
								min={0}
								step="0.01"
								value={perSessionRate}
								onChange={(e) => setPerSessionRate(e.target.value)}
								required={kind === "scheduled_recurring"}
							/>
						</div>
					</div>
				</section>
			)}

			<section className="rounded-lg border bg-card p-6 space-y-3">
				<div className="space-y-2">
					<Label htmlFor="notes">Notes (internal)</Label>
					<Textarea
						id="notes"
						rows={3}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder="Anything the team should know — discounts, access notes, etc."
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
