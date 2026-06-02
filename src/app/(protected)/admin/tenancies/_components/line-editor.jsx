"use client";

import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
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
import SchedulesEditor, { emptyWeeklyRule } from "./schedules-editor";

function newId() {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return `l_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyOccupancyLine() {
	return {
		_id: newId(),
		kind: "occupancy",
		room_id: "",
		label: "",
		monthly_rate_cents: null,
	};
}

export function emptyScheduledLine() {
	return {
		_id: newId(),
		kind: "scheduled",
		room_id: "",
		label: "",
		schedule_rule: [emptyWeeklyRule()],
		billing_mode: "per_session",
		per_session_rate_cents: null,
		per_hour_rate_cents: null,
		fixed_monthly_rate_cents: null,
	};
}

function ratePounds(cents) {
	if (cents == null || cents === "") return "";
	return (Number(cents) / 100).toString();
}

function rateCents(pounds) {
	if (pounds === "" || pounds == null) return null;
	const n = Number(pounds);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(n * 100);
}

/**
 * One tenancy_line card. The parent owns the array; this is fully
 * controlled. Occupancy lines must point at a non-public room
 * (server-side enforces too); scheduled lines can use either.
 */
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtGbp = (c) => gbp.format((c ?? 0) / 100);

export default function LineEditor({ value, onChange, onRemove, rooms, roomRackRates = {} }) {
	const line = value;
	const rackRateCents = line.room_id ? roomRackRates[line.room_id] : null;

	function update(patch) {
		onChange({ ...line, ...patch });
	}

	function changeKind(kind) {
		// Preserve what we can; reset the mode-specific stuff.
		if (kind === "occupancy") {
			onChange({
				_id: line._id,
				kind: "occupancy",
				room_id: line.room_id ?? "",
				label: line.label ?? "",
				monthly_rate_cents: null,
			});
		} else {
			onChange({
				_id: line._id,
				kind: "scheduled",
				room_id: line.room_id ?? "",
				label: line.label ?? "",
				schedule_rule:
					Array.isArray(line.schedule_rule) && line.schedule_rule.length
						? line.schedule_rule
						: [emptyWeeklyRule()],
				billing_mode: "per_session",
				per_session_rate_cents: null,
				per_hour_rate_cents: null,
				fixed_monthly_rate_cents: null,
			});
		}
	}

	const privateRooms = rooms.filter((r) => r.is_public === false);
	const publicRooms = rooms.filter((r) => r.is_public !== false);

	const roomsForKind =
		line.kind === "occupancy" ? privateRooms : rooms;

	return (
		<div className="rounded-lg border bg-card p-5 space-y-4">
			<div className="flex items-center justify-between gap-3 flex-wrap">
				<div className="flex gap-1 rounded-md border bg-background p-0.5">
					{[
						{ key: "occupancy", label: "Occupancy" },
						{ key: "scheduled", label: "Scheduled bookings" },
					].map((opt) => (
						<button
							key={opt.key}
							type="button"
							onClick={() => changeKind(opt.key)}
							className={`px-3 py-1 text-xs rounded-sm transition ${
								line.kind === opt.key
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
					onClick={onRemove}
					className="text-destructive hover:text-destructive"
				>
					Remove line
				</Button>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label className="text-xs">Room</Label>
					<Select
						value={line.room_id || ""}
						onValueChange={(v) => update({ room_id: v })}
					>
						<SelectTrigger>
							<SelectValue
								placeholder={
									line.kind === "occupancy"
										? "Pick a non-public room"
										: "Pick a room"
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{line.kind === "occupancy" ? (
								privateRooms.length === 0 ? (
									<div className="px-2 py-1.5 text-sm text-muted-foreground">
										No non-public rooms available.
									</div>
								) : (
									privateRooms.map((r) => (
										<SelectItem key={r.id} value={r.id}>
											{r.name}
										</SelectItem>
									))
								)
							) : (
								<>
									{publicRooms.length > 0 && (
										<SelectGroup>
											<SelectLabel>Public rooms</SelectLabel>
											{publicRooms.map((r) => (
												<SelectItem key={r.id} value={r.id}>
													{r.name}
												</SelectItem>
											))}
										</SelectGroup>
									)}
									{publicRooms.length > 0 && privateRooms.length > 0 && <SelectSeparator />}
									{privateRooms.length > 0 && (
										<SelectGroup>
											<SelectLabel>Non-public rooms</SelectLabel>
											{privateRooms.map((r) => (
												<SelectItem key={r.id} value={r.id}>
													{r.name}
												</SelectItem>
											))}
										</SelectGroup>
									)}
								</>
							)}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label className="text-xs">Label (optional, shows on invoice)</Label>
					<Input
						value={line.label ?? ""}
						onChange={(e) => update({ label: e.target.value })}
						placeholder={
							line.kind === "occupancy" ? "e.g. Storage" : "e.g. Tue/Thu mornings"
						}
						maxLength={120}
					/>
				</div>
			</div>

			{line.kind === "occupancy" ? (
				<div className="space-y-1.5 max-w-sm">
					<Label className="text-xs">Monthly rate (£)</Label>
					<Input
						type="number"
						min={0}
						step="0.01"
						value={ratePounds(line.monthly_rate_cents)}
						onChange={(e) =>
							update({ monthly_rate_cents: rateCents(e.target.value) })
						}
						placeholder="e.g. 40"
					/>
					<p className="text-[11px] text-muted-foreground">
						Charged every month regardless of usage. The room is fully theirs.
					</p>
				</div>
			) : (
				<>
					<div className="space-y-1.5">
						<Label className="text-xs">Schedules</Label>
						<SchedulesEditor
							value={line.schedule_rule}
							onChange={(rules) => update({ schedule_rule: rules })}
						/>
					</div>

					<div className="space-y-2">
						<div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
							Rate override
						</div>
						<p className="text-[11px] text-muted-foreground">
							{rackRateCents != null
								? `Leave the rate blank to bill at this room's standard rate of ${fmtGbp(rackRateCents)}/hour. Set a rate to override.`
								: "This room has no standard hourly rate configured, so a rate must be set."}
						</p>
						<div className="grid gap-3 sm:grid-cols-2 items-end">
							<div className="space-y-1.5">
								<Label className="text-xs">Billing mode</Label>
								<Select
									value={line.billing_mode || "per_session"}
									onValueChange={(v) =>
										update({
											billing_mode: v,
											// Clear rates not relevant to the new mode so the
											// payload doesn't carry stale figures.
											per_session_rate_cents: v === "per_session" ? line.per_session_rate_cents : null,
											per_hour_rate_cents: v === "per_hour" ? line.per_hour_rate_cents : null,
											fixed_monthly_rate_cents:
												v === "fixed_monthly" ? line.fixed_monthly_rate_cents : null,
										})
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="per_session">
											Per session
										</SelectItem>
										<SelectItem value="per_hour">Per hour</SelectItem>
										<SelectItem value="fixed_monthly">
											Fixed monthly
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label className="text-xs">
									{line.billing_mode === "per_session" && "Rate per session (£)"}
									{line.billing_mode === "per_hour" && "Rate per hour (£)"}
									{line.billing_mode === "fixed_monthly" && "Fixed monthly (£)"}
									{!line.billing_mode && "Rate (£)"}
								</Label>
								<Input
									type="number"
									min={0}
									step="0.01"
									value={
										line.billing_mode === "per_session"
											? ratePounds(line.per_session_rate_cents)
											: line.billing_mode === "per_hour"
												? ratePounds(line.per_hour_rate_cents)
												: ratePounds(line.fixed_monthly_rate_cents)
									}
									onChange={(e) => {
										const cents = rateCents(e.target.value);
										if (line.billing_mode === "per_session") {
											update({ per_session_rate_cents: cents });
										} else if (line.billing_mode === "per_hour") {
											update({ per_hour_rate_cents: cents });
										} else if (line.billing_mode === "fixed_monthly") {
											update({ fixed_monthly_rate_cents: cents });
										}
									}}
									placeholder={
										rackRateCents != null
											? `Standard: ${fmtGbp(rackRateCents)}/hour`
											: "e.g. 20"
									}
								/>
							</div>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
