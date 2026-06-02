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
import { createTenancyAction, updateTenancyAction } from "../actions";
import LineEditor, {
	emptyOccupancyLine,
	emptyScheduledLine,
} from "./line-editor";
import InvoicePreview from "./invoice-preview";
import OrganisationStatusPanel from "./organisation-status-panel";

function toPounds(cents) {
	if (cents == null || cents === "") return "";
	return (Number(cents) / 100).toString();
}

function toCents(pounds) {
	if (pounds === "" || pounds == null) return null;
	const n = Number(pounds);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(n * 100);
}

function clientNewId() {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return `l_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Convert existing tenancy_line rows from the DB into the form's
 * client-side line shape. The DB rows hold all the columns; the form
 * expects only the relevant ones plus a `_id` for React keys.
 */
function linesFromDb(rows) {
	if (!Array.isArray(rows) || rows.length === 0) return [];
	return rows.map((l) => {
		if (l.kind === "occupancy") {
			return {
				_id: l.id ?? clientNewId(),
				kind: "occupancy",
				room_id: l.room_id,
				label: l.label ?? "",
				monthly_rate_cents: l.monthly_rate_cents,
			};
		}
		return {
			_id: l.id ?? clientNewId(),
			kind: "scheduled",
			room_id: l.room_id,
			label: l.label ?? "",
			schedule_rule: Array.isArray(l.schedule_rule) ? l.schedule_rule : [],
			billing_mode: l.billing_mode ?? "per_session",
			per_session_rate_cents: l.per_session_rate_cents,
			per_hour_rate_cents: l.per_hour_rate_cents,
			fixed_monthly_rate_cents: l.fixed_monthly_rate_cents,
		};
	});
}

function stripLineForSubmit(line) {
	const base = { kind: line.kind, room_id: line.room_id, label: line.label || null };
	if (line.kind === "occupancy") {
		return { ...base, monthly_rate_cents: line.monthly_rate_cents };
	}
	return {
		...base,
		schedule_rule: line.schedule_rule,
		billing_mode: line.billing_mode,
		per_session_rate_cents:
			line.billing_mode === "per_session" ? line.per_session_rate_cents : null,
		per_hour_rate_cents:
			line.billing_mode === "per_hour" ? line.per_hour_rate_cents : null,
		fixed_monthly_rate_cents:
			line.billing_mode === "fixed_monthly" ? line.fixed_monthly_rate_cents : null,
	};
}

function validateLines(lines, rooms, roomRackRates = {}) {
	const roomById = new Map(rooms.map((r) => [r.id, r]));
	for (const [i, l] of lines.entries()) {
		const label = `Line ${i + 1}`;
		if (!l.room_id) return `${label}: pick a room.`;
		const room = roomById.get(l.room_id);
		if (l.kind === "occupancy") {
			if (room && room.is_public) return `${label}: occupancy needs a non-public room.`;
			if ((l.monthly_rate_cents ?? 0) <= 0) return `${label}: monthly rate is required.`;
			continue;
		}
		if (!Array.isArray(l.schedule_rule) || l.schedule_rule.length === 0) {
			return `${label}: add at least one schedule rule.`;
		}
		for (const r of l.schedule_rule) {
			if ((r.by_weekday ?? []).length === 0) {
				return `${label}: every rule needs at least one weekday.`;
			}
			if (!r.time_start || !r.time_end) {
				return `${label}: every rule needs a start and end time.`;
			}
			if (r.kind === "monthly_nth" && (r.by_set_pos ?? []).length === 0) {
				return `${label}: monthly rules need at least one ordinal (1st, 2nd, …).`;
			}
		}
		// A blank rate means "use the room's standard hourly rate". That
		// fallback only works when the room actually HAS a standard rate.
		const rateForMode =
			l.billing_mode === "per_session"
				? l.per_session_rate_cents
				: l.billing_mode === "per_hour"
					? l.per_hour_rate_cents
					: l.billing_mode === "fixed_monthly"
						? l.fixed_monthly_rate_cents
						: null;
		const hasOverride =
			(l.per_session_rate_cents ?? null) != null ||
			(l.per_hour_rate_cents ?? null) != null ||
			(l.fixed_monthly_rate_cents ?? null) != null;
		if (!hasOverride) {
			if (!roomRackRates[l.room_id]) {
				return `${label}: this room has no standard hourly rate, so a rate is required.`;
			}
			continue;
		}
		if (!l.billing_mode) return `${label}: pick a billing mode when overriding the rate.`;
		if ((rateForMode ?? 0) <= 0) {
			return `${label}: rate is required for the chosen billing mode.`;
		}
	}
	return null;
}

export default function TenancyForm({ organisations, rooms, roomRackRates = {}, initial = null }) {
	const router = useRouter();
	const isEdit = !!initial;

	const [organisationId, setOrganisationId] = useState(initial?.organisation_id ?? "");
	const [label, setLabel] = useState(initial?.label ?? "");
	const [startsOn, setStartsOn] = useState(initial?.starts_on ?? "");
	const [endsOn, setEndsOn] = useState(initial?.ends_on ?? "");
	const [invoiceDay, setInvoiceDay] = useState(initial?.invoice_day_of_month ?? 1);
	const [monthlyOverride, setMonthlyOverride] = useState(
		toPounds(initial?.monthly_override_cents),
	);
	const [notes, setNotes] = useState(initial?.notes ?? "");
	const [lines, setLines] = useState(linesFromDb(initial?.lines));
	const [autoBillViaDd, setAutoBillViaDd] = useState(!!initial?.auto_bill_via_dd);
	const [saving, setSaving] = useState(false);

	const selectedOrg = organisations.find((o) => o.id === organisationId) || null;
	const orgDdReady = !!selectedOrg?.direct_debit_ready_at;

	function updateLineAt(idx, next) {
		setLines((cur) => cur.map((l, i) => (i === idx ? next : l)));
	}
	function removeLineAt(idx) {
		setLines((cur) => cur.filter((_, i) => i !== idx));
	}
	function addOccupancy() {
		setLines((cur) => [...cur, emptyOccupancyLine()]);
	}
	function addScheduled() {
		setLines((cur) => [...cur, emptyScheduledLine()]);
	}

	async function submit(e) {
		e.preventDefault();
		if (!organisationId || !startsOn) {
			toast.error("Organisation and start date are required.");
			return;
		}
		if (lines.length === 0) {
			toast.error("Add at least one line (occupancy or scheduled).");
			return;
		}
		const lineError = validateLines(lines, rooms, roomRackRates);
		if (lineError) {
			toast.error(lineError);
			return;
		}
		setSaving(true);
		try {
			const payload = {
				organisation_id: organisationId,
				label: label || null,
				starts_on: startsOn,
				ends_on: endsOn || null,
				invoice_day_of_month: Number(invoiceDay),
				monthly_override_cents: toCents(monthlyOverride),
				auto_bill_via_dd: autoBillViaDd,
				notes: notes || null,
				lines: lines.map(stripLineForSubmit),
			};
			if (isEdit) {
				await updateTenancyAction({ id: initial.id, ...payload });
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
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="organisation">Organisation</Label>
						<Select
							value={organisationId}
							onValueChange={setOrganisationId}
							disabled={isEdit}
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
						<Label htmlFor="label">Label (optional)</Label>
						<Input
							id="label"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder="e.g. Home Start Newark — combined"
							maxLength={200}
						/>
					</div>
				</div>
			</section>

			{selectedOrg && (
				<OrganisationStatusPanel organisation={selectedOrg} isEdit={isEdit} />
			)}

			<section className="rounded-lg border bg-card p-6 space-y-5">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Dates &amp; invoicing
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
						<p className="text-[10px] text-muted-foreground">
							1-28; capped at 28 so it lands every month.
						</p>
					</div>
				</div>
			</section>

			<section className="rounded-lg border bg-card p-6 space-y-4">
				<div className="flex items-baseline justify-between gap-3 flex-wrap">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Lines
					</h2>
					<p className="text-[11px] text-muted-foreground max-w-md">
						Add one line per room. An occupancy line bills a fixed monthly
						amount for the room being theirs; a scheduled line bills per
						session, per hour, or a fixed monthly figure against a recurring
						schedule.
					</p>
				</div>

				<div className="space-y-3">
					{lines.length === 0 && (
						<div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
							No lines yet. Add at least one to bill anything.
						</div>
					)}
					{lines.map((line, idx) => (
						<LineEditor
							key={line._id}
							value={line}
							onChange={(next) => updateLineAt(idx, next)}
							onRemove={() => removeLineAt(idx)}
							rooms={rooms}
							roomRackRates={roomRackRates}
						/>
					))}
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button type="button" variant="outline" onClick={addOccupancy}>
						+ Add occupancy line
					</Button>
					<Button type="button" variant="outline" onClick={addScheduled}>
						+ Add scheduled line
					</Button>
				</div>
			</section>

			<section className="rounded-lg border bg-card p-6 space-y-3">
				<div className="flex items-baseline justify-between gap-3 flex-wrap">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Fixed monthly total (override)
					</h2>
					<p className="text-[11px] text-muted-foreground max-w-md">
						Optional. When set, every invoice lands on this exact figure no
						matter what the lines sum to. The would-have-been sum and the
						implied discount/surcharge are shown on the invoice.
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
						placeholder="Leave blank to bill the line items"
					/>
				</div>
			</section>

			<section className="rounded-lg border bg-card p-6 space-y-3">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Auto-billing
				</h2>
				<label className="flex items-start gap-3 cursor-pointer">
					<Checkbox
						checked={autoBillViaDd}
						onCheckedChange={(v) => setAutoBillViaDd(!!v)}
						className="mt-0.5"
					/>
					<div className="space-y-1">
						<div className="text-sm font-medium">
							Auto-bill via direct debit
						</div>
						<p className="text-[11px] text-muted-foreground max-w-md">
							When enabled, each issued invoice is charged automatically against
							the organisation's direct-debit mandate.{" "}
							{!orgDdReady && (
								<span className="text-amber-600 dark:text-amber-400">
									The organisation has no active direct debit yet — set it up
									above first, otherwise invoices will be issued but not charged.
								</span>
							)}
						</p>
					</div>
				</label>
			</section>

			<InvoicePreview
				tenancyStartsOn={startsOn}
				tenancyEndsOn={endsOn}
				monthlyOverrideCents={toCents(monthlyOverride)}
				lines={lines}
				rooms={rooms}
				roomRackRates={roomRackRates}
			/>

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
