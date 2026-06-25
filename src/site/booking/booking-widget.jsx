"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
import { ScrollArea } from "@/shadcn/components/ui/scroll-area";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { byPrefixAndName } from "@awesome.me/kit-71c392801a/icons";
import { DatePicker } from "./date-picker";
import { TimePicker } from "./time-picker";
import { expandPattern, weekdayPositionInMonth } from "@/lib/booking/recurrence";
import IdentityStep, { EMPTY_IDENTITY, identityComplete } from "./identity-step.jsx";

const stepVariants = {
	enter: (dir) => ({ x: dir === "back" ? -60 : 60, opacity: 0 }),
	center: { x: 0, opacity: 1 },
	exit: (dir) => ({ x: dir === "back" ? 60 : -60, opacity: 0 }),
};
const stepTransition = { duration: 0.32, ease: [0.32, 0.72, 0, 1] };

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
});

const venueDateFmt = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/London",
	weekday: "short",
	day: "numeric",
	month: "short",
});
const venueTimeFmt = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/London",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

function formatDateShort(d) {
	if (!d) return "";
	const dt = new Date(`${d}T00:00:00`);
	if (Number.isNaN(dt.valueOf())) return d;
	return dateFormatter.format(dt);
}

function formatVenueDate(iso) {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.valueOf())) return "";
	return venueDateFmt.format(d);
}

function formatVenueTime(iso) {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.valueOf())) return "";
	return venueTimeFmt.format(d);
}

function formatHours(h) {
	const v = Number(h ?? 0);
	if (Number.isInteger(v)) return `${v}h`;
	return `${v.toFixed(2).replace(/\.?0+$/, "")}h`;
}

function combineLocalDateTime(date, time) {
	if (!date || !time) return null;
	const d = new Date(`${date}T${time}:00`);
	if (Number.isNaN(d.valueOf())) return null;
	return d.toISOString();
}

function emptyDateRow() {
	return { date: "", start_time: "", end_time: "" };
}
function isRowComplete(r) {
	return Boolean(r.date && r.start_time && r.end_time);
}

function emptyTicketTypeDraft() {
	return { name: "", price_pounds: "", max_quantity: "" };
}

function ticketTypeDraftValid(t) {
	if (!t.name.trim()) return false;
	const p = Number(t.price_pounds);
	if (!Number.isFinite(p) || p < 0) return false;
	return true;
}

function buildIdentityPayload(id) {
	if (id.phase === "pick_org") {
		return {
			mode: "existing_org",
			organisation_id: id.selectedOrgId,
		};
	}
	if (id.phase === "new_org") {
		// Logged-in user creating a fresh organisation
		return {
			mode: "new_org_existing_user",
			new_org: {
				name: id.newOrgName.trim(),
				description: id.newOrgDescription.trim(),
			},
		};
	}
	if (id.phase === "new_user") {
		return {
			mode: "new_user_new_org",
			new_user: {
				first_name: id.firstName.trim(),
				last_name: id.lastName.trim(),
				email: id.email.trim(),
				phone: id.phone.trim() || null,
				marketing_opt_in: !!id.marketingOptIn,
			},
			new_org: {
				name: id.newOrgName.trim(),
				description: id.newOrgDescription.trim(),
			},
		};
	}
	if (id.phase === "admin_form") {
		const customer = {
			first_name: id.firstName.trim(),
			last_name: id.lastName.trim(),
			email: id.email.trim(),
			phone: id.phone.trim() || null,
		};
		if (id.adminCreatingOrg) {
			return {
				mode: "admin_create",
				customer,
				new_org: {
					name: id.newOrgName.trim(),
					description: id.newOrgDescription.trim(),
				},
			};
		}
		return {
			mode: "admin_create",
			customer,
			organisation_id: id.selectedOrgId,
		};
	}
	return null;
}

export default function BookingWidget({
	rooms,
	bookingTypes,
	discounts = [],
	ticketingSettings = null,
	preselectedRoomSlug,
	lockedRoomId = null,
	mode = "standalone",
	availableOrganisations = [],
}) {
	const router = useRouter();

	const initialRoomId = useMemo(() => {
		if (lockedRoomId) return lockedRoomId;
		const pre = rooms.find((r) => r.slug === preselectedRoomSlug);
		return pre?.id ?? "";
	}, [lockedRoomId, preselectedRoomSlug, rooms]);

	const [roomId, setRoomId] = useState(initialRoomId);
	const room = rooms.find((r) => r.id === roomId) ?? null;

	const typeByKey = useMemo(() => {
		const m = new Map();
		for (const t of bookingTypes) m.set(t.key, t);
		return m;
	}, [bookingTypes]);
	const eventType = typeByKey.get("event");
	const setupType = typeByKey.get("setup");
	const rehearsalType = typeByKey.get("rehearsal");
	const teardownType = typeByKey.get("teardown");

	const offeredTypeIds = new Set(room?.offered_booking_type_ids ?? []);
	const offers = (t) => Boolean(t && offeredTypeIds.has(t.id));

	const facilityPackages = room?.facility_packages ?? [];
	const layouts = room?.capacities ?? [];

	// Per-type segments
	const [eventRows, setEventRows] = useState([emptyDateRow()]);
	const [setupRows, setSetupRows] = useState([]);
	const [rehearsalRows, setRehearsalRows] = useState([]);
	const [teardownRows, setTeardownRows] = useState([]);

	// One layout per room (applies to all segments). Hidden if 0/1 layouts.
	const [layoutId, setLayoutId] = useState("");

	const [facilitySelections, setFacilitySelections] = useState({});
	const [discountId, setDiscountId] = useState(null);
	const [ticketingEnabled, setTicketingEnabled] = useState(false);
	const [ticketSetupMode, setTicketSetupMode] = useState("later"); // "later" | "now"
	const [pendingTicketTypes, setPendingTicketTypes] = useState([emptyTicketTypeDraft()]);
	const [identity, setIdentity] = useState(EMPTY_IDENTITY);
	const [eventBrief, setEventBrief] = useState("");

	// Recurrence: null when the booking is a single occurrence; otherwise the
	// pattern object that gets expanded client-side into multiple identical
	// segments. Only valid when the booking has exactly one event row and no
	// setup/rehearsal/teardown - i.e. the typical regular-hire shape.
	const [recurrence, setRecurrence] = useState(null);

	const [quote, setQuote] = useState(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState(null);

	useEffect(() => {
		setFacilitySelections({});
		setSetupRows([]);
		setRehearsalRows([]);
		setTeardownRows([]);
		setTicketingEnabled(false);
		if (layouts.length === 1) setLayoutId(layouts[0].layout_id);
		else if (!layouts.find((l) => l.layout_id === layoutId)) setLayoutId("");
	}, [roomId]);

	// Skip the room-picker step when the room is already chosen - either
	// locked programmatically (popup mode) or arrived via `?room=` on
	// /book. The user lands directly on the date step in both cases.
	const skipRoomStep =
		!!lockedRoomId ||
		(!!preselectedRoomSlug && rooms.some((r) => r.slug === preselectedRoomSlug));

	// Build steps dynamically
	const steps = useMemo(() => {
		const list = [];
		if (!skipRoomStep) list.push({ key: "room", title: "Room" });
		list.push({ key: "event", title: "Main event" });
		if (offers(setupType)) list.push({ key: "setup", title: "Setup" });
		if (offers(rehearsalType)) list.push({ key: "rehearsal", title: "Rehearsal" });
		if (offers(teardownType)) list.push({ key: "teardown", title: "Teardown" });
		if (facilityPackages.length > 0) list.push({ key: "facilities", title: "Add-ons" });
		if (room?.allow_ticketed_events) list.push({ key: "ticketing", title: "Ticketing" });
		if (discounts.length > 0) list.push({ key: "discounts", title: "Discounts" });
		list.push({ key: "identity", title: "Who's booking" });
		list.push({ key: "event_brief", title: "About this event" });
		list.push({ key: "review", title: "Review" });
		return list;
	}, [
		skipRoomStep,
		offeredTypeIds,
		facilityPackages.length,
		discounts.length,
		room?.allow_ticketed_events,
		setupType,
		rehearsalType,
		teardownType,
	]);

	const [stepKey, setStepKey] = useState(steps[0]?.key ?? "event");
	const [direction, setDirection] = useState("forward");
	const stepIndex = Math.max(0, steps.findIndex((s) => s.key === stepKey));
	const currentStep = steps[stepIndex] ?? steps[0];

	useEffect(() => {
		if (!steps.find((s) => s.key === stepKey)) {
			setStepKey(steps[0]?.key ?? "event");
		}
	}, [steps, stepKey]);

	function goNext() {
		const next = steps[stepIndex + 1];
		if (next) {
			setDirection("forward");
			setStepKey(next.key);
		}
	}
	function goBack() {
		const prev = steps[stepIndex - 1];
		if (prev) {
			setDirection("back");
			setStepKey(prev.key);
		}
	}

	// Whether the recurrence option is available - only when there's exactly
	// one main event row and none of the auxiliary segment types are in use.
	// This keeps the recurrence semantics unambiguous (one repeating slot per
	// occurrence) without trying to repeat setup/rehearsal/teardown.
	const canRepeat = useMemo(
		() =>
			eventRows.length === 1 &&
			isRowComplete(eventRows[0]) &&
			setupRows.length === 0 &&
			rehearsalRows.length === 0 &&
			teardownRows.length === 0,
		[eventRows, setupRows, rehearsalRows, teardownRows],
	);

	// Drop the recurrence selection automatically if the underlying conditions
	// (single event row, no aux segments) become invalid.
	useEffect(() => {
		if (!canRepeat && recurrence) setRecurrence(null);
	}, [canRepeat, recurrence]);

	// Build segments for the API. When `recurrence` is set we expand the
	// single event row into N segments via the shared pattern helper.
	const apiSegments = useMemo(() => {
		const out = [];
		const push = (rows, type) => {
			if (!type || !roomId) return;
			for (const r of rows) {
				if (!isRowComplete(r)) continue;
				out.push({
					room_id: roomId,
					booking_type_id: type.id,
					layout_id: layoutId || null,
					starts_at: combineLocalDateTime(r.date, r.start_time),
					ends_at: combineLocalDateTime(r.date, r.end_time),
				});
			}
		};
		push(eventRows, eventType);
		push(setupRows, setupType);
		push(rehearsalRows, rehearsalType);
		push(teardownRows, teardownType);

		if (recurrence && out.length === 1) {
			const template = out[0];
			let additional = [];
			try {
				additional = expandPattern({
					templateStart: new Date(template.starts_at),
					templateEnd: new Date(template.ends_at),
					pattern: recurrence,
				});
			} catch {
				additional = [];
			}
			for (const occ of additional) {
				out.push({
					...template,
					starts_at: occ.starts_at.toISOString(),
					ends_at: occ.ends_at.toISOString(),
				});
			}
		}

		return out;
	}, [eventRows, setupRows, rehearsalRows, teardownRows, roomId, layoutId, eventType, setupType, rehearsalType, teardownType, recurrence]);

	const apiFacilitySelections = useMemo(() => {
		return Object.entries(facilitySelections)
			.filter(([, qty]) => Number(qty) > 0)
			.map(([id, qty]) => ({ facility_package_id: id, quantity: Number(qty) }));
	}, [facilitySelections]);

	// Live quote
	useEffect(() => {
		if (!apiSegments.length) {
			setQuote(null);
			return;
		}
		const controller = new AbortController();
		const handle = setTimeout(async () => {
			setQuoteLoading(true);
			try {
				const res = await fetch("/api/quote", {
					method: "POST",
					signal: controller.signal,
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						segments: apiSegments,
						facility_selections: apiFacilitySelections,
						discount_id: discountId,
						ticketing: ticketingEnabled && room?.allow_ticketed_events
							? { enabled: true, room_id: roomId }
							: { enabled: false },
					}),
				});
				const data = await res.json();
				setQuote(data);
			} catch (err) {
				if (err?.name !== "AbortError") setQuote(null);
			} finally {
				setQuoteLoading(false);
			}
		}, 400);
		return () => {
			controller.abort();
			clearTimeout(handle);
		};
	}, [apiSegments, apiFacilitySelections, discountId, ticketingEnabled, room?.allow_ticketed_events, roomId]);

	// Per-step "can advance" rule
	const canAdvance = (() => {
		switch (currentStep?.key) {
			case "room":
				return Boolean(roomId);
			case "event":
				return (
					eventRows.length > 0 &&
					eventRows.every(isRowComplete) &&
					eventRows.every((r) => !r.conflict)
				);
			case "setup":
				return setupRows.every(isRowComplete) && setupRows.every((r) => !r.conflict);
			case "rehearsal":
				return (
					rehearsalRows.every(isRowComplete) &&
					rehearsalRows.every((r) => !r.conflict)
				);
			case "teardown":
				return (
					teardownRows.every(isRowComplete) &&
					teardownRows.every((r) => !r.conflict)
				);
			case "facilities":
				return true;
			case "ticketing": {
				if (!ticketingEnabled) return true;
				if (ticketSetupMode === "later") return true;
				return (
					pendingTicketTypes.length > 0 &&
					pendingTicketTypes.every(ticketTypeDraftValid)
				);
			}
			case "discounts":
				return true;
			case "identity":
				return identityComplete(identity);
			case "event_brief":
				return eventBrief.trim().length >= 3;
			case "review":
				return false;
			default:
				return true;
		}
	})();

	async function submit() {
		setSubmitting(true);
		setSubmitError(null);
		try {
			const res = await fetch("/api/bookings", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					identity: buildIdentityPayload(identity),
					customer_notes: eventBrief.trim() || null,
					segments: apiSegments,
					facility_selections: apiFacilitySelections,
					discount_id: discountId,
					ticketing: ticketingEnabled && room?.allow_ticketed_events
						? { enabled: true, room_id: roomId }
						: { enabled: false },
					pending_ticket_types:
						ticketingEnabled && ticketSetupMode === "now"
							? pendingTicketTypes
									.filter(ticketTypeDraftValid)
									.map((t, i) => ({
										name: t.name.trim(),
										price_cents: Math.round(Number(t.price_pounds) * 100),
										max_quantity: t.max_quantity
											? Math.max(1, parseInt(t.max_quantity, 10))
											: null,
										sort_order: i,
									}))
							: null,
					recurrence_rule: recurrence,
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || "Submission failed");
			if (mode === "admin") {
				router.push(`/admin/bookings/${data.id}`);
			} else if (data.event_id && ticketSetupMode === "now") {
				router.push(`/my-events/${data.event_id}/setup`);
			} else {
				// Same minimal landing page the email links to — shows
				// only the reference and a magic-link gated CTA to
				// /my-bookings/[id] for the full picture.
				router.push(`/booking-received/${data.id}`);
			}
		} catch (err) {
			setSubmitError(err?.message || "Submission failed");
		} finally {
			setSubmitting(false);
		}
	}

	const isPopup = mode === "popup";

	const summary = (
		<QuoteSummary
			rooms={rooms}
			bookingTypes={bookingTypes}
			room={room}
			eventRows={eventRows}
			setupRows={setupRows}
			rehearsalRows={rehearsalRows}
			teardownRows={teardownRows}
			facilitySelections={facilitySelections}
			facilityPackages={facilityPackages}
			discount={discounts.find((d) => d.id === discountId) ?? null}
			quote={quote}
			quoteLoading={quoteLoading}
			recurrence={recurrence}
			occurrenceCount={apiSegments.length}
			bordered={false}
		/>
	);

	const stepScrollRef = useRef(null);
	const summaryScrollRef = useRef(null);

	useEffect(() => {
		const el = stepScrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
		if (el) el.scrollTop = 0;
	}, [stepKey]);

	const stepsContent = (
		<AnimatePresence mode="wait" custom={direction} initial={false}>
			<motion.div
				key={currentStep?.key ?? "x"}
				custom={direction}
				variants={stepVariants}
				initial="enter"
				animate="center"
				exit="exit"
				transition={stepTransition}
				className="space-y-6"
			>
				{currentStep?.key === "room" && (
					<RoomStep rooms={rooms} roomId={roomId} onChange={setRoomId} />
				)}
				{currentStep?.key === "event" && (
					<div className="space-y-6">
						<DateRowsStep
							title={`When's your event at ${room?.name ?? "the venue"}?`}
							subtitle="Pick the date and time. Add another for multi-night runs."
							rows={eventRows}
							onChange={setEventRows}
							addLabel="+ Add another event date"
							layouts={layouts}
							layoutId={layoutId}
							onLayoutChange={setLayoutId}
							required
							roomId={roomId}
						/>
						{canRepeat && (
							<RecurrenceBlock
								templateRow={eventRows[0]}
								recurrence={recurrence}
								onChange={setRecurrence}
							/>
						)}
					</div>
				)}
				{currentStep?.key === "setup" && (
					<ConditionalDateStep
						title="Do you need a setup day?"
						subtitle="A pre-event day for load-in, rigging, or anything else. Charged at a reduced rate."
						rows={setupRows}
						onChange={setSetupRows}
						addLabel="+ Add a setup day"
						roomId={roomId}
					/>
				)}
				{currentStep?.key === "rehearsal" && (
					<ConditionalDateStep
						title="Do you need a rehearsal day?"
						subtitle="A separate block for rehearsal."
						rows={rehearsalRows}
						onChange={setRehearsalRows}
						addLabel="+ Add a rehearsal day"
						roomId={roomId}
					/>
				)}
				{currentStep?.key === "teardown" && (
					<ConditionalDateStep
						title="Do you need a teardown day?"
						subtitle="Day after the event for load-out and clean-up."
						rows={teardownRows}
						onChange={setTeardownRows}
						addLabel="+ Add a teardown day"
						roomId={roomId}
					/>
				)}
				{currentStep?.key === "facilities" && (
					<FacilitiesStep
						packages={facilityPackages}
						selections={facilitySelections}
						onChange={setFacilitySelections}
					/>
				)}
				{currentStep?.key === "ticketing" && (
					<TicketingStep
						room={room}
						ticketingSettings={ticketingSettings}
						enabled={ticketingEnabled}
						onChange={setTicketingEnabled}
						ticketingQuote={quote?.ticketing}
						setupMode={ticketSetupMode}
						onSetupModeChange={setTicketSetupMode}
						pendingTypes={pendingTicketTypes}
						onPendingTypesChange={setPendingTicketTypes}
					/>
				)}
				{currentStep?.key === "discounts" && (
					<DiscountsStep
						discounts={discounts}
						selectedId={discountId}
						onChange={setDiscountId}
					/>
				)}
				{currentStep?.key === "identity" && (
					<IdentityStep
						value={identity}
						onChange={setIdentity}
						adminMode={mode === "admin"}
						availableOrganisations={availableOrganisations}
					/>
				)}
				{currentStep?.key === "event_brief" && (
					<EventBriefStep value={eventBrief} onChange={setEventBrief} />
				)}
				{currentStep?.key === "review" && (
					<ReviewStep
						rooms={rooms}
						room={room}
						bookingTypes={bookingTypes}
						eventRows={eventRows}
						setupRows={setupRows}
						rehearsalRows={rehearsalRows}
						teardownRows={teardownRows}
						facilitySelections={facilitySelections}
						facilityPackages={facilityPackages}
						identity={identity}
						eventBrief={eventBrief}
						quote={quote}
						ticketingEnabled={ticketingEnabled && room?.allow_ticketed_events}
						ticketSetupMode={ticketSetupMode}
						pendingTicketTypes={pendingTicketTypes}
					/>
				)}
			</motion.div>
		</AnimatePresence>
	);

	const navFooter = (
		<>
			<Button
				variant="outline"
				onClick={goBack}
				disabled={stepIndex === 0 || submitting}
			>
				Back
			</Button>
			{currentStep?.key === "review" ? (
				<div className="flex flex-col items-end gap-2">
					{submitError && (
						<span className="text-sm text-destructive">{submitError}</span>
					)}
					<Button
						onClick={submit}
						disabled={submitting || !apiSegments.length || !identityComplete(identity) || !eventBrief.trim()}
					>
						{submitting ? "Submitting…" : "Submit enquiry"}
					</Button>
				</div>
			) : (
				<Button onClick={goNext} disabled={!canAdvance}>
					Next
				</Button>
			)}
		</>
	);

	if (isPopup) {
		return (
			<div className="grid gap-8 lg:grid-cols-[1.85fr_1fr] lg:items-stretch lg:h-full lg:min-h-0">
				<div className="flex flex-col lg:min-h-0">
					<div className="flex flex-col lg:flex-1 lg:min-h-0 lg:overflow-hidden">
						<ScrollArea ref={stepScrollRef} className="lg:flex-1 lg:min-h-0">
							<div className="lg:pr-3">{stepsContent}</div>
						</ScrollArea>
						<div className="flex shrink-0 items-center justify-between gap-3 border-t border-foreground/10 pt-6 mt-6 lg:mt-0 lg:pt-4">
							{navFooter}
						</div>
					</div>
				</div>

				<aside className="flex flex-col lg:min-h-0 border-t border-foreground/10 pt-8 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
					<ScrollArea ref={summaryScrollRef} className="lg:flex-1 lg:min-h-0">
						<div className="lg:pr-3">{summary}</div>
					</ScrollArea>
				</aside>
			</div>
		);
	}

	return (
		<>
			<MobileSummaryBar
				summary={summary}
				room={room}
				eventRows={eventRows}
				quote={quote}
			/>
			<div className="grid gap-8 lg:grid-cols-[1.85fr_1fr] lg:items-start">
				<div>
					{/* No card chrome on phones - the form sits directly on the page
					    background so the limited screen real estate isn't eaten by
					    border + padding. Card returns from `md` upwards. */}
					<div className="md:rounded-xl md:border md:border-foreground/10 md:bg-card md:p-8">
						{stepsContent}
						<div className="flex items-center justify-between gap-3 pt-6 mt-6 border-t border-foreground/10">
							{navFooter}
						</div>
					</div>
				</div>

				<aside className="hidden lg:block rounded-xl border border-foreground/10 bg-card p-6 lg:sticky lg:top-28 self-start">
					{summary}
				</aside>
			</div>
		</>
	);
}

/**
 * Compact summary that's sticky at the top of the page on mobile only.
 * Tapping the bar slides the full QuoteSummary down underneath it. Hidden
 * from `lg` upwards where the right-rail summary is visible inline.
 */
function MobileSummaryBar({ summary, room, eventRows, quote }) {
	const [open, setOpen] = useState(false);
	const firstDate = eventRows?.[0]?.date;
	const firstDateLabel = (() => {
		if (!firstDate) return null;
		const d = new Date(`${firstDate}T12:00`);
		if (Number.isNaN(d.valueOf())) return null;
		return dateFormatter.format(d);
	})();
	const total = quote?.total_cents;
	const chevronIcon = byPrefixAndName.fas?.["chevron-down"];

	return (
		<div className="lg:hidden sticky top-0 z-30 mb-4 -mx-4 sm:-mx-6 bg-background/95 backdrop-blur border-y border-foreground/10">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 text-left"
				aria-expanded={open}
			>
				<div className="min-w-0 flex-1">
					<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
						{room?.name ?? "Pick a room"}
					</div>
					<div className="text-xs text-foreground/85 truncate">
						{firstDateLabel ?? "Pick a date"}
					</div>
				</div>
				<div className="text-right shrink-0">
					<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Total
					</div>
					<div className="font-mono font-medium tabular-nums text-sm">
						{total != null ? formatGbp(total) : "-"}
					</div>
				</div>
				{chevronIcon && (
					<FontAwesomeIcon
						icon={chevronIcon}
						className={`h-3 w-3 text-muted-foreground transition-transform ${
							open ? "rotate-180" : ""
						}`}
					/>
				)}
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.18 }}
						className="overflow-hidden border-t border-foreground/10"
					>
						<div className="p-4 max-h-[60vh] overflow-y-auto">{summary}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function RoomStep({ rooms, roomId, onChange }) {
	return (
		<div className="space-y-5">
			<div>
				<h2 className="font-display text-2xl tracking-tight">Which room?</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Pick the room you&apos;d like to hire. Each one has its own setup and pricing.
				</p>
			</div>
			<div className="grid gap-3">
				{rooms.map((r) => {
					const selected = r.id === roomId;
					return (
						<button
							key={r.id}
							type="button"
							onClick={() => onChange(r.id)}
							className={`text-left rounded-lg border px-4 py-4 transition flex items-start justify-between gap-4 ${
								selected
									? "border-primary bg-primary/5"
									: "border-foreground/10 hover:border-foreground/30 bg-background"
							}`}
						>
							<div className="min-w-0">
								<div className="font-display text-xl tracking-tight">{r.name}</div>
								{r.tagline && (
									<div className="mt-1 text-sm text-muted-foreground">{r.tagline}</div>
								)}
							</div>
							<div className="text-right shrink-0">
								{r.capacities?.[0] && (
									<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
										Up to {Math.max(...r.capacities.map((c) => c.value))}
									</div>
								)}
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

function DateRow({ row, onChange, onRemove, canRemove, roomId, onConflictChange }) {
	function set(patch) {
		onChange({ ...row, ...patch });
	}

	const startsIso = combineLocalDateTime(row.date, row.start_time);
	const endsIso = combineLocalDateTime(row.date, row.end_time);
	const complete = Boolean(roomId && startsIso && endsIso && row.start_time < row.end_time);

	const [availability, setAvailability] = useState(null);
	const [checking, setChecking] = useState(false);

	useEffect(() => {
		if (!complete) {
			setAvailability(null);
			onConflictChange?.(false);
			return;
		}
		// Pessimistically block until the server confirms availability - this
		// closes the race where the user changes dates and clicks Next before
		// the new check returns.
		setAvailability(null);
		onConflictChange?.(true);
		const controller = new AbortController();
		const handle = setTimeout(async () => {
			setChecking(true);
			try {
				const res = await fetch("/api/availability", {
					method: "POST",
					signal: controller.signal,
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						room_id: roomId,
						starts_at: startsIso,
						ends_at: endsIso,
					}),
				});
				const data = await res.json();
				if (res.ok) {
					setAvailability(data);
					onConflictChange?.(data.available === false);
				} else {
					setAvailability(null);
					onConflictChange?.(false);
				}
			} catch (err) {
				if (err?.name !== "AbortError") {
					setAvailability(null);
					onConflictChange?.(false);
				}
			} finally {
				setChecking(false);
			}
		}, 400);
		return () => {
			controller.abort();
			clearTimeout(handle);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [roomId, startsIso, endsIso, complete]);

	const conflicts = availability?.available === false ? availability.conflicts : [];

	return (
		<div className="space-y-2">
			<div className="grid gap-3 rounded-lg border border-foreground/10 bg-background p-4 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
				<div className="space-y-1.5">
					<Label className="text-xs uppercase tracking-[0.18em]">Date</Label>
					<DatePicker
						value={row.date}
						onChange={(v) => set({ date: v })}
						placeholder="Pick a date"
					/>
				</div>
				<div className="space-y-1.5">
					<Label className="text-xs uppercase tracking-[0.18em]">Start</Label>
					<TimePicker value={row.start_time} onChange={(v) => set({ start_time: v })} />
				</div>
				<div className="space-y-1.5">
					<Label className="text-xs uppercase tracking-[0.18em]">End</Label>
					<TimePicker value={row.end_time} onChange={(v) => set({ end_time: v })} />
				</div>
				<div className="flex items-end">
					{canRemove && (
						<Button variant="ghost" size="sm" onClick={onRemove}>
							Remove
						</Button>
					)}
				</div>
			</div>
			{checking && (
				<p className="text-xs text-muted-foreground">Checking availability…</p>
			)}
			{!checking && conflicts.length > 0 && (
				<ConflictWarning conflicts={conflicts} bufferMinutes={availability.buffer_minutes ?? 0} />
			)}
		</div>
	);
}

function ConflictWarning({ conflicts, bufferMinutes }) {
	const first = conflicts[0];
	// Show the *effective* unavailable window - the booked/event time
	// plus the room's required buffer either side.
	const bufferMs = (bufferMinutes ?? 0) * 60 * 1000;
	const blockedStart = new Date(new Date(first.starts_at).getTime() - bufferMs);
	const blockedEnd = new Date(new Date(first.ends_at).getTime() + bufferMs);
	const startStr = formatVenueTime(blockedStart);
	const endStr = formatVenueTime(blockedEnd);
	const dateStr = formatVenueDate(blockedStart);
	const heading =
		first.kind === "event"
			? "This room is hosting an event then."
			: first.kind === "blockout"
				? "The room isn't available then."
				: "Time conflicts with an existing booking.";
	return (
		<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
			<div className="font-medium">{heading}</div>
			<div className="mt-0.5">
				Room in use {dateStr} · {startStr}-{endStr}
				{conflicts.length > 1 && (
					<span className="text-destructive/80"> · +{conflicts.length - 1} more</span>
				)}
			</div>
		</div>
	);
}

function DateRowsStep({
	title,
	subtitle,
	rows,
	onChange,
	addLabel,
	layouts = null,
	layoutId,
	onLayoutChange,
	required = false,
	roomId,
}) {
	function update(i, next) {
		onChange(rows.map((r, j) => (j === i ? next : r)));
	}
	function remove(i) {
		onChange(rows.filter((_, j) => j !== i));
	}
	function addAnother() {
		const last = rows[rows.length - 1];
		onChange([
			...rows,
			{ date: "", start_time: last?.start_time ?? "", end_time: last?.end_time ?? "" },
		]);
	}

	const showLayout = Array.isArray(layouts) && layouts.length > 1;

	return (
		<div className="space-y-5">
			<div>
				<h2 className="font-display text-2xl tracking-tight">{title}</h2>
				{subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
			</div>

			{showLayout && (
				<div className="space-y-2">
					<Label>Layout</Label>
					<div className="grid gap-2 sm:grid-cols-2">
						{layouts.map((l) => {
							const iconDef = l.icon ? byPrefixAndName.fas[l.icon] : null;
							const checked = layoutId === l.layout_id;
							return (
								<button
									key={l.layout_id}
									type="button"
									onClick={() => onLayoutChange(l.layout_id)}
									className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
										checked
											? "border-primary bg-primary/5"
											: "border-foreground/10 hover:border-foreground/30 bg-background"
									}`}
								>
									{iconDef && (
										<FontAwesomeIcon
											icon={iconDef}
											className="h-5 w-5 text-muted-foreground shrink-0"
										/>
									)}
									<div className="min-w-0 flex-1">
										<div className="font-medium">{l.label}</div>
										<div className="text-xs text-muted-foreground">
											Up to {l.value}
										</div>
									</div>
								</button>
							);
						})}
					</div>
				</div>
			)}

			<div className="space-y-3">
				{rows.map((r, i) => (
					<DateRow
						key={i}
						row={r}
						onChange={(next) => update(i, next)}
						onRemove={() => remove(i)}
						canRemove={rows.length > 1 || !required}
						roomId={roomId}
						onConflictChange={(c) =>
							onChange((prev) =>
								prev.map((pr, j) => (j === i ? { ...pr, conflict: c } : pr)),
							)
						}
					/>
				))}
			</div>
			<Button type="button" variant="outline" size="sm" onClick={addAnother}>
				{addLabel}
			</Button>
		</div>
	);
}

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

function RecurrenceBlock({ templateRow, recurrence, onChange }) {
	const enabled = !!recurrence;
	const templateDate = useMemo(() => {
		if (!templateRow?.date) return null;
		const [y, m, d] = templateRow.date.split("-").map(Number);
		return new Date(y, m - 1, d);
	}, [templateRow?.date]);

	const defaultWeeklyDay = templateDate?.getDay() ?? 1;
	const defaultDayOfMonth = templateDate?.getDate() ?? 1;
	const defaultWeekdayPos = templateDate ? weekdayPositionInMonth(templateDate) : { weekday: 1, position: 1 };

	const [draft, setDraft] = useState(() => recurrence ?? {
		kind: "weekly",
		interval: 1,
		day_of_month: defaultDayOfMonth,
		weekday: defaultWeekdayPos.weekday,
		position: defaultWeekdayPos.position,
		count: 12,
		until_date: null,
		limit_kind: "count",
	});

	function commit(next) {
		setDraft(next);
		const { limit_kind, ...rest } = next;
		const payload = {
			...rest,
			count: limit_kind === "count" ? rest.count ?? 12 : null,
			until_date: limit_kind === "until" ? rest.until_date ?? null : null,
		};
		// strip irrelevant fields per kind
		if (payload.kind === "weekly") {
			delete payload.day_of_month;
			delete payload.weekday;
			delete payload.position;
		} else if (payload.kind === "monthly_day") {
			delete payload.weekday;
			delete payload.position;
		} else if (payload.kind === "monthly_weekday") {
			delete payload.day_of_month;
		}
		onChange(payload);
	}

	function toggle(on) {
		if (on) {
			commit(draft);
		} else {
			onChange(null);
		}
	}

	return (
		<div className="rounded-xl border border-foreground/10 bg-background/40 p-5 space-y-4">
			<label className="flex items-center gap-3 cursor-pointer">
				<Checkbox checked={enabled} onCheckedChange={(v) => toggle(!!v)} />
				<div>
					<div className="font-medium">Make this a recurring booking</div>
					<div className="text-xs text-muted-foreground">
						Same room, same time slot, repeating on a schedule. The quote below will update to reflect every occurrence.
					</div>
				</div>
			</label>
			{enabled && templateDate && (
				<div className="space-y-3 pl-7 pt-1 border-t border-foreground/10">
					<div className="space-y-1.5">
						<Label>Pattern</Label>
						<Select
							value={draft.kind}
							onValueChange={(v) => commit({ ...draft, kind: v })}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="weekly">Weekly</SelectItem>
								<SelectItem value="monthly_day">Monthly on the {defaultDayOfMonth}{getOrdinal(defaultDayOfMonth)}</SelectItem>
								<SelectItem value="monthly_weekday">Monthly on a specific weekday</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1.5">
						<Label>Every</Label>
						<div className="flex items-center gap-2">
							<Input
								type="number"
								min="1"
								max="12"
								value={draft.interval}
								onChange={(e) => commit({ ...draft, interval: Number(e.target.value) || 1 })}
								className="w-20"
							/>
							<span className="text-sm">
								{draft.kind === "weekly" ? "week(s)" : "month(s)"}
							</span>
						</div>
					</div>

					{draft.kind === "monthly_weekday" && (
						<div className="grid gap-2 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label>Position</Label>
								<Select
									value={String(draft.position)}
									onValueChange={(v) => commit({ ...draft, position: Number(v) })}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{POSITIONS.map((p) => (
											<SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label>Weekday</Label>
								<Select
									value={String(draft.weekday)}
									onValueChange={(v) => commit({ ...draft, weekday: Number(v) })}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{WEEKDAYS.map((d) => (
											<SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
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
									name="rec-limit-kind"
									value="count"
									checked={draft.limit_kind === "count"}
									onChange={() => commit({ ...draft, limit_kind: "count" })}
								/>
								Number of occurrences
							</label>
							<label className="flex items-center gap-1.5 text-sm">
								<input
									type="radio"
									name="rec-limit-kind"
									value="until"
									checked={draft.limit_kind === "until"}
									onChange={() => commit({ ...draft, limit_kind: "until" })}
								/>
								Date
							</label>
						</div>
						{draft.limit_kind === "count" ? (
							<div className="flex items-center gap-2 pt-1">
								<Input
									type="number"
									min="2"
									max="156"
									value={draft.count ?? 12}
									onChange={(e) => commit({ ...draft, count: Number(e.target.value) || 2 })}
									className="w-24"
								/>
								<span className="text-sm">total (including the first)</span>
							</div>
						) : (
							<Input
								type="date"
								value={draft.until_date ?? ""}
								onChange={(e) => commit({ ...draft, until_date: e.target.value || null })}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function getOrdinal(n) {
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return s[(v - 20) % 10] ?? s[v] ?? s[0];
}

function ConditionalDateStep({ title, subtitle, rows, onChange, addLabel, roomId }) {
	function update(i, next) {
		onChange(rows.map((r, j) => (j === i ? next : r)));
	}
	function addOne() {
		const last = rows[rows.length - 1];
		onChange([
			...rows,
			{ date: "", start_time: last?.start_time ?? "", end_time: last?.end_time ?? "" },
		]);
	}

	return (
		<div className="space-y-5">
			<div>
				<h2 className="font-display text-2xl tracking-tight">{title}</h2>
				{subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
			</div>

			{rows.length > 0 && (
				<div className="space-y-3">
					{rows.map((r, i) => (
						<DateRow
							key={i}
							row={r}
							onChange={(next) => update(i, next)}
							onRemove={() => onChange(rows.filter((_, j) => j !== i))}
							canRemove
							roomId={roomId}
							onConflictChange={(c) =>
								onChange((prev) =>
									prev.map((pr, j) => (j === i ? { ...pr, conflict: c } : pr)),
								)
							}
						/>
					))}
				</div>
			)}

			<Button type="button" variant="outline" size="sm" onClick={addOne}>
				{rows.length === 0 ? addLabel.replace(/^\+\s*Add\s+a/i, "+ Add a") : addLabel.replace(/^\+\s*Add\s+a/i, "+ Add another")}
			</Button>
		</div>
	);
}

function FacilitiesStep({ packages, selections, onChange }) {
	const byCategory = useMemo(() => {
		const cats = new Map();
		for (const p of packages) {
			if (!cats.has(p.category_id)) {
				cats.set(p.category_id, {
					id: p.category_id,
					label: p.category_label,
					icon: p.category_icon,
					sort_order: p.category_sort_order ?? 0,
					rows: [],
				});
			}
		}
		for (const cat of cats.values()) {
			const inCat = packages.filter((p) => p.category_id === cat.id);
			const groupMap = new Map();
			const ungrouped = [];
			for (const p of inCat) {
				if (p.group_id) {
					if (!groupMap.has(p.group_id)) {
						groupMap.set(p.group_id, {
							id: p.group_id,
							label: p.group_label ?? "Choose one",
							sort_order: p.group_sort_order ?? 0,
							items: [],
						});
					}
					groupMap.get(p.group_id).items.push(p);
				} else {
					ungrouped.push(p);
				}
			}
			const groups = [...groupMap.values()].sort((a, b) => a.sort_order - b.sort_order);
			cat.rows = [
				...groups.map((g) => ({ kind: "group", group: g })),
				...ungrouped.map((p) => ({ kind: "single", pkg: p })),
			];
		}
		return [...cats.values()].sort((a, b) => a.sort_order - b.sort_order);
	}, [packages]);

	function setQty(id, qty) {
		const next = { ...selections };
		if (!qty || qty <= 0) delete next[id];
		else next[id] = qty;
		onChange(next);
	}
	function toggle(id, on) {
		setQty(id, on ? 1 : 0);
	}
	function pickInGroup(groupItems, id) {
		const next = { ...selections };
		for (const p of groupItems) {
			if (p.id === id) next[p.id] = 1;
			else delete next[p.id];
		}
		onChange(next);
	}
	function clearGroup(groupItems) {
		const next = { ...selections };
		for (const p of groupItems) delete next[p.id];
		onChange(next);
	}

	return (
		<div className="space-y-6">
			<div>
				<h2 className="font-display text-2xl tracking-tight">Add anything to your booking?</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Optional add-ons. Tick what you&apos;d like. Quantities default to one.
				</p>
			</div>

			{byCategory.map((cat) => {
				const iconDef = cat.icon ? byPrefixAndName.fas[cat.icon] : null;
				return (
					<div key={cat.id} className="space-y-3">
						<h3 className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-primary">
							{iconDef && <FontAwesomeIcon icon={iconDef} className="h-3.5 w-3.5" />}
							{cat.label}
						</h3>
						<div className="grid gap-3">
							{cat.rows.map((row) => {
								if (row.kind === "group") {
									return (
										<GroupCard
											key={`g-${row.group.id}`}
											group={row.group}
											selections={selections}
											onPick={(id) => pickInGroup(row.group.items, id)}
											onClear={() => clearGroup(row.group.items)}
										/>
									);
								}
								const p = row.pkg;
								const qty = selections[p.id] ?? 0;
								const checked = qty > 0;
								const quantifiable = !!p.quantifiable;
								return (
									<div
										key={p.id}
										role="button"
										tabIndex={0}
										onClick={() => toggle(p.id, !checked)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												toggle(p.id, !checked);
											}
										}}
										className={`rounded-lg border p-4 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
											checked
												? "border-primary bg-primary/5"
												: "border-foreground/10 bg-background hover:border-foreground/30"
										}`}
									>
										<div className="flex items-start justify-between gap-4">
											<div className="flex items-start gap-3 min-w-0">
												<CheckIndicator checked={checked} className="mt-1" />
												<div className="min-w-0">
													<div className="font-medium">{p.name}</div>
													{p.summary && (
														<div className="text-sm text-muted-foreground mt-0.5">
															{p.summary}
														</div>
													)}
												</div>
											</div>
											<div className="text-right shrink-0">
												<div className="font-mono text-sm">
													{(p.price_cents ?? 0) > 0 ? formatGbp(p.price_cents) : "Included"}
												</div>
												{checked && quantifiable && (
													<Input
														type="number"
														min="1"
														max="500"
														value={qty}
														onClick={(e) => e.stopPropagation()}
														onChange={(e) =>
															setQty(p.id, Math.max(1, Number(e.target.value || 1)))
														}
														className="mt-2 w-20 text-right"
														aria-label="Quantity"
													/>
												)}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function GroupCard({ group, selections, onPick, onClear }) {
	const selectedId = group.items.find((p) => (selections[p.id] ?? 0) > 0)?.id ?? null;
	return (
		<div className="rounded-lg border border-foreground/10 bg-background/40 p-4 space-y-3">
			<div className="flex items-baseline justify-between gap-3">
				<div className="text-xs uppercase tracking-[0.18em] text-foreground/70">
					{group.label}
				</div>
				{selectedId && (
					<button
						type="button"
						onClick={onClear}
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						Clear
					</button>
				)}
			</div>
			<div className="grid gap-2" role="radiogroup" aria-label={group.label}>
				{group.items.map((p) => {
					const checked = selectedId === p.id;
					return (
						<div
							key={p.id}
							role="radio"
							aria-checked={checked}
							tabIndex={0}
							onClick={() => onPick(p.id)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onPick(p.id);
								}
							}}
							className={`rounded-md border p-3 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
								checked
									? "border-primary bg-primary/5"
									: "border-foreground/10 hover:border-foreground/30 bg-background"
							}`}
						>
							<div className="flex items-start justify-between gap-4">
								<div className="flex items-start gap-3 min-w-0">
									<RadioIndicator checked={checked} className="mt-1" />
									<div className="min-w-0">
										<div className="font-medium">{p.name}</div>
										{p.summary && (
											<div className="text-sm text-muted-foreground mt-0.5">
												{p.summary}
											</div>
										)}
									</div>
								</div>
								<div className="text-right shrink-0">
									<div className="font-mono text-sm">
										{(p.price_cents ?? 0) > 0 ? formatGbp(p.price_cents) : "Included"}
									</div>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function RadioIndicator({ checked, className = "" }) {
	return (
		<span
			aria-hidden
			className={`grid h-4 w-4 shrink-0 place-content-center rounded-full border ${
				checked ? "border-primary" : "border-foreground/40"
			} ${className}`}
		>
			{checked && <span className="h-2 w-2 rounded-full bg-primary" />}
		</span>
	);
}

function ticketingFeeSentence(pctX100, flatCents) {
	const pct = (pctX100 ?? 0) / 100;
	const flatStr = formatGbp(flatCents ?? 0);
	const includes = " This includes our ticketing system and a free listing on our What's On website (which can be omitted from public display if needed).";

	if ((pctX100 ?? 0) === 0 && (flatCents ?? 0) === 0) {
		return `Tickets are processed at no extra fee.${includes}`;
	}
	if ((pctX100 ?? 0) === 0) {
		return `We'll charge a flat ${flatStr} per ticket processed through our system.${includes}`;
	}
	if ((flatCents ?? 0) === 0) {
		return `We'll charge a fee of ${pct}% per ticket processed through our system.${includes}`;
	}
	return `We'll charge a fee of ${pct}% plus a flat ${flatStr} per ticket processed through our system.${includes}`;
}

function TicketingStep({
	room,
	ticketingSettings,
	enabled,
	onChange,
	ticketingQuote,
	setupMode,
	onSetupModeChange,
	pendingTypes,
	onPendingTypesChange,
}) {
	const setupPct = (room?.ticketing_setup_fee_pct_x100 ?? 0) / 100;
	const platformPctX100 = ticketingSettings?.platform_fee_pct_x100 ?? 0;
	const platformFlatCents = ticketingSettings?.platform_fee_flat_cents ?? 0;
	const setupFeeCents = ticketingQuote?.setup_fee_cents ?? null;
	const eventBasis = ticketingQuote?.event_day_basis_cents ?? null;

	return (
		<div className="space-y-5">
			<div>
				<h2 className="font-display text-2xl tracking-tight">Ticketing</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Sell tickets to your event through The Assembly Rooms.
				</p>
			</div>

			<div
				role="button"
				tabIndex={0}
				onClick={() => onChange(!enabled)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onChange(!enabled);
					}
				}}
				className={`w-full text-left rounded-lg border px-4 py-4 transition flex items-start gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
					enabled
						? "border-primary bg-primary/5"
						: "border-foreground/10 hover:border-foreground/30 bg-background"
				}`}
			>
				<CheckIndicator checked={enabled} className="mt-0.5" />
				<div className="min-w-0 flex-1">
					<div className="font-medium">Add ticketing for this booking</div>
					<div className="text-sm text-muted-foreground mt-1">
						{setupPct > 0 ? (
							<>
								One-off setup fee:{" "}
								<span className="text-foreground/85">
									{setupPct}% of your event-day hire
									{enabled && setupFeeCents != null && eventBasis != null
										? ` - ${formatGbp(setupFeeCents)} on ${formatGbp(eventBasis)}`
										: ""}
								</span>
								. Discounts don&apos;t apply to this fee.
							</>
						) : (
							<>No setup fee for this room.</>
						)}
					</div>
				</div>
			</div>

			{enabled && (
				<div className="rounded-lg border border-foreground/10 bg-background p-4 text-sm text-foreground/85">
					<p>{ticketingFeeSentence(platformPctX100, platformFlatCents)}</p>
				</div>
			)}

			{enabled && (
				<TicketSetupBranch
					mode={setupMode}
					onModeChange={onSetupModeChange}
					types={pendingTypes}
					onTypesChange={onPendingTypesChange}
				/>
			)}
		</div>
	);
}

function TicketSetupBranch({ mode, onModeChange, types, onTypesChange }) {
	function update(i, patch) {
		onTypesChange(types.map((t, j) => (j === i ? { ...t, ...patch } : t)));
	}
	function remove(i) {
		onTypesChange(types.filter((_, j) => j !== i));
	}
	function addAnother() {
		onTypesChange([...types, emptyTicketTypeDraft()]);
	}
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-2">
				<ModePill
					active={mode === "now"}
					onClick={() => onModeChange("now")}
					title="Set up the event now"
					subtitle="Sketch out your ticket types and we&apos;ll spin up a draft event you can refine straight away."
				/>
				<ModePill
					active={mode === "later"}
					onClick={() => onModeChange("later")}
					title="Skip, set it up later"
					subtitle="Submit the booking first and design the event afterwards."
				/>
			</div>
			{mode === "now" && (
				<div className="space-y-3 rounded-lg border border-foreground/10 bg-background p-4">
					<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Ticket types
					</div>
					{types.map((t, i) => (
						<div
							key={i}
							className="grid grid-cols-[1.6fr_1fr_1fr_auto] gap-2 items-end"
						>
							<div className="space-y-1">
								<Label className="text-xs" htmlFor={`tt-name-${i}`}>
									Name
								</Label>
								<Input
									id={`tt-name-${i}`}
									placeholder="Standard"
									value={t.name}
									onChange={(e) => update(i, { name: e.target.value })}
								/>
							</div>
							<div className="space-y-1">
								<Label className="text-xs" htmlFor={`tt-price-${i}`}>
									Price (£)
								</Label>
								<Input
									id={`tt-price-${i}`}
									type="number"
									inputMode="decimal"
									step="0.01"
									min="0"
									placeholder="10.00"
									value={t.price_pounds}
									onChange={(e) => update(i, { price_pounds: e.target.value })}
								/>
							</div>
							<div className="space-y-1">
								<Label className="text-xs" htmlFor={`tt-qty-${i}`}>
									Cap (optional)
								</Label>
								<Input
									id={`tt-qty-${i}`}
									type="number"
									min="1"
									step="1"
									placeholder="-"
									value={t.max_quantity}
									onChange={(e) => update(i, { max_quantity: e.target.value })}
								/>
							</div>
							<Button
								variant="ghost"
								size="sm"
								disabled={types.length === 1}
								onClick={() => remove(i)}
							>
								Remove
							</Button>
						</div>
					))}
					<Button type="button" variant="outline" size="sm" onClick={addAnother}>
						+ Add another type
					</Button>
				</div>
			)}
		</div>
	);
}

function ModePill({ active, onClick, title, subtitle }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`text-left rounded-lg border px-4 py-3 transition ${
				active
					? "border-primary bg-primary/5"
					: "border-foreground/10 hover:border-foreground/30 bg-background"
			}`}
		>
			<div className="font-medium text-sm">{title}</div>
			<div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
		</button>
	);
}

function DiscountsStep({ discounts, selectedId, onChange }) {
	return (
		<div className="space-y-5">
			<div>
				<h2 className="font-display text-2xl tracking-tight">Eligible for a discount?</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Pick one if any apply to you. We&apos;ll verify when we review your enquiry. Discounts apply to room hire only.
				</p>
			</div>
			<div className="grid gap-3">
				<button
					type="button"
					onClick={() => onChange(null)}
					className={`text-left rounded-lg border px-4 py-3 transition flex items-start justify-between gap-4 ${
						selectedId == null
							? "border-primary bg-primary/5"
							: "border-foreground/10 hover:border-foreground/30 bg-background"
					}`}
				>
					<div className="min-w-0">
						<div className="font-medium">No discount</div>
						<div className="text-xs text-muted-foreground mt-0.5">
							I don&apos;t qualify for any of these.
						</div>
					</div>
				</button>
				{discounts.map((d) => {
					const checked = selectedId === d.id;
					return (
						<button
							key={d.id}
							type="button"
							onClick={() => onChange(d.id)}
							className={`text-left rounded-lg border px-4 py-3 transition flex items-start justify-between gap-4 ${
								checked
									? "border-primary bg-primary/5"
									: "border-foreground/10 hover:border-foreground/30 bg-background"
							}`}
						>
							<div className="min-w-0">
								<div className="font-medium">{d.label}</div>
								{d.description && (
									<div className="text-xs text-muted-foreground mt-0.5">
										{d.description}
									</div>
								)}
							</div>
							<div className="shrink-0 font-mono text-sm text-primary">
								{(d.percent_x100 / 100).toFixed(0)}% off
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

function EventBriefStep({ value, onChange }) {
	return (
		<div className="space-y-5">
			<div>
				<h2 className="font-display text-2xl tracking-tight">Tell us about your event</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					A few sentences is plenty: what you&apos;re putting on, expected
					attendance, anything we should know.
				</p>
			</div>
			<div className="space-y-2">
				<Label htmlFor="event-brief">In a few words, what&apos;s the event?</Label>
				<Textarea
					id="event-brief"
					rows={6}
					required
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="e.g. our annual choir concert, around 200 guests, doors at 7, performance 7.30 to 9.30. We'll bring our own staging."
				/>
			</div>
		</div>
	);
}

function ReviewStep({ rooms, room, bookingTypes, eventRows, setupRows, rehearsalRows, teardownRows, facilitySelections, facilityPackages, identity, eventBrief, quote, ticketingEnabled, ticketSetupMode, pendingTicketTypes }) {
	const reviewWho = (() => {
		const sessionEmail = identity.sessionUser?.email || identity.email;
		if (identity.phase === "pick_org") {
			const org = identity.myOrgs.find((o) => o.id === identity.selectedOrgId);
			return { name: sessionEmail, org: org?.name || null };
		}
		if (identity.phase === "new_org") {
			return { name: sessionEmail, org: identity.newOrgName };
		}
		if (identity.phase === "new_user") {
			return {
				name: `${identity.firstName} ${identity.lastName}`.trim() || identity.email,
				org: identity.newOrgName,
			};
		}
		return { name: sessionEmail || "-", org: null };
	})();
	const totals = quote
		? {
			subtotal: quote.subtotal_cents,
			vat: quote.vat_cents,
			total: quote.total_cents,
			deposit: quote.deposit_required_cents,
		}
		: null;

	const groups = [
		{ label: "Main event", rows: eventRows },
		{ label: "Setup", rows: setupRows },
		{ label: "Rehearsal", rows: rehearsalRows },
		{ label: "Teardown", rows: teardownRows },
	].filter((g) => g.rows.length > 0);

	const selectedPackages = facilityPackages.filter((p) => (facilitySelections[p.id] ?? 0) > 0);

	return (
		<div className="space-y-6">
			<div>
				<h2 className="font-display text-2xl tracking-tight">Review your enquiry</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Have a final look. Submitting won&apos;t charge anything. We&apos;ll respond within a working day.
				</p>
			</div>

			<div className="space-y-4">
				<div className="rounded-lg border border-foreground/10 bg-background p-4">
					<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Room</div>
					<div className="mt-1 font-display text-xl tracking-tight">{room?.name ?? "-"}</div>
				</div>
				{groups.map((g) => (
					<div key={g.label} className="rounded-lg border border-foreground/10 bg-background p-4">
						<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{g.label}</div>
						<ul className="mt-2 space-y-1 text-sm">
							{g.rows.map((r, i) => (
								<li key={i}>
									{formatDateShort(r.date)} · {r.start_time}-{r.end_time}
								</li>
							))}
						</ul>
					</div>
				))}
				{selectedPackages.length > 0 && (
					<div className="rounded-lg border border-foreground/10 bg-background p-4">
						<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Add-ons</div>
						<ul className="mt-2 space-y-1 text-sm">
							{selectedPackages.map((p) => {
								const qty = facilitySelections[p.id];
								return (
									<li key={p.id} className="flex items-baseline justify-between gap-4">
										<span>
											{p.name}
											{qty > 1 ? ` × ${qty}` : ""}
										</span>
										<span className="font-mono text-muted-foreground">
											{formatGbp((p.price_cents ?? 0) * qty)}
										</span>
									</li>
								);
							})}
						</ul>
					</div>
				)}
				{ticketingEnabled && (
					<div className="rounded-lg border border-foreground/10 bg-background p-4">
						<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							Ticketing
						</div>
						{ticketSetupMode === "now" &&
						pendingTicketTypes.some(ticketTypeDraftValid) ? (
							<ul className="mt-2 space-y-1 text-sm">
								{pendingTicketTypes
									.filter(ticketTypeDraftValid)
									.map((t, i) => {
										const cents = Math.round(Number(t.price_pounds) * 100);
										return (
											<li
												key={i}
												className="flex items-baseline justify-between gap-4"
											>
												<span>
													{t.name}
													{t.max_quantity ? ` · cap ${t.max_quantity}` : ""}
												</span>
												<span className="font-mono text-muted-foreground">
													{formatGbp(cents)}
												</span>
											</li>
										);
									})}
							</ul>
						) : (
							<p className="mt-2 text-sm text-muted-foreground">
								We&apos;ll set up the ticket types with you after approval.
							</p>
						)}
					</div>
				)}

				<div className="rounded-lg border border-foreground/10 bg-background p-4">
					<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">You</div>
					<div className="mt-1">{reviewWho.name}</div>
					{reviewWho.org && (
						<div className="text-sm text-muted-foreground">{reviewWho.org}</div>
					)}
					{eventBrief && (
						<p className="mt-2 text-sm whitespace-pre-line">{eventBrief}</p>
					)}
				</div>
				{totals && (
					<div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
						<div className="text-xs uppercase tracking-[0.22em] text-primary">Total</div>
						<div className="mt-1 flex items-baseline justify-between">
							<span className="font-display text-3xl tracking-tight">{formatGbp(totals.total)}</span>
							{totals.deposit > 0 && (
								<span className="text-sm text-muted-foreground">
									Deposit on approval: <span className="font-mono">{formatGbp(totals.deposit)}</span>
								</span>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function QuoteSummary({
	rooms,
	bookingTypes,
	room,
	eventRows,
	setupRows,
	rehearsalRows,
	teardownRows,
	facilitySelections,
	facilityPackages,
	discount,
	quote,
	quoteLoading,
	recurrence = null,
	occurrenceCount = 0,
	bordered = true,
}) {
	const selectedPackages = facilityPackages.filter((p) => (facilitySelections[p.id] ?? 0) > 0);

	const pendingGroups = [
		{ key: "event", label: "Main event", rows: eventRows },
		{ key: "setup", label: "Setup", rows: setupRows },
		{ key: "rehearsal", label: "Rehearsal", rows: rehearsalRows },
		{ key: "teardown", label: "Teardown", rows: teardownRows },
	].filter((g) => g.rows.length > 0);

	const typeById = new Map(bookingTypes.map((t) => [t.id, t]));
	const groupOrder = ["event", "setup", "rehearsal", "teardown"];
	const groupLabels = {
		event: "Main event",
		setup: "Setup",
		rehearsal: "Rehearsal",
		teardown: "Teardown",
	};
	const quoteGroups = (() => {
		if (!quote?.segments?.length) return null;
		const byKey = new Map();
		for (const seg of quote.segments) {
			const t = typeById.get(seg.booking_type_id);
			const key = t?.key ?? "other";
			if (!byKey.has(key)) byKey.set(key, { key, label: groupLabels[key] ?? t?.label ?? "-", segments: [] });
			byKey.get(key).segments.push(seg);
		}
		const ordered = [];
		for (const k of groupOrder) if (byKey.has(k)) ordered.push(byKey.get(k));
		for (const [k, g] of byKey) if (!groupOrder.includes(k)) ordered.push(g);
		return ordered;
	})();

	return (
		<div
			className={`space-y-5 ${
				bordered ? "rounded-xl border border-foreground/10 bg-card p-6" : ""
			}`}
		>
			<div className="flex items-center justify-between">
				<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">
					Your quote
				</h2>
				{quoteLoading && (
					<span className="text-xs text-muted-foreground">Updating…</span>
				)}
			</div>
			{!room && (
				<p className="text-sm text-muted-foreground">
					Pick a room to see live pricing.
				</p>
			)}
			{room && (
				<div className="space-y-1 pb-2 border-b border-foreground/10">
					<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
						Room
					</div>
					<div className="font-display text-xl tracking-tight">{room.name}</div>
					{recurrence && occurrenceCount > 1 && (
						<div className="pt-2">
							<span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.15em] text-primary">
								Recurring · {occurrenceCount} occurrence{occurrenceCount === 1 ? "" : "s"}
							</span>
						</div>
					)}
				</div>
			)}
			{!quoteGroups && pendingGroups.length === 0 && room && (
				<p className="text-sm text-muted-foreground">
					Add a date for your event to start pricing.
				</p>
			)}
			{!quoteGroups && pendingGroups.length > 0 && (
				<div className="space-y-3 text-sm">
					{pendingGroups.map((g) => (
						<div key={g.key}>
							<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
								{g.label}
							</div>
							<ul className="space-y-1">
								{g.rows.map((r, i) => (
									<li key={i} className="flex items-baseline justify-between gap-4">
										<span className="truncate">
											{formatDateShort(r.date) || "Date pending"}
											{r.start_time && r.end_time
												? ` · ${r.start_time}-${r.end_time}`
												: ""}
										</span>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			)}
			{quoteGroups && (
				<div className="space-y-4">
					{quoteGroups.map((g) => (
						<div key={g.key} className="space-y-3">
							<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
								{g.label}
							</div>
							{g.segments.map((seg, i) => (
								<SegmentBreakdown key={i} segment={seg} />
							))}
						</div>
					))}
				</div>
			)}
			{selectedPackages.length > 0 && (
				<div className="space-y-3 text-sm">
					<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
						Add-ons
					</div>
					{(() => {
						const byCat = new Map();
						for (const p of selectedPackages) {
							const key = p.category_id ?? "other";
							if (!byCat.has(key)) {
								byCat.set(key, {
									key,
									label: p.category_label ?? "Add-ons",
									sort_order: p.category_sort_order ?? 0,
									items: [],
								});
							}
							byCat.get(key).items.push(p);
						}
						const cats = [...byCat.values()].sort((a, b) => a.sort_order - b.sort_order);
						return cats.map((c) => (
							<div key={c.key} className="space-y-1">
								<div className="text-xs text-foreground/70">{c.label}</div>
								<ul className="space-y-1">
									{c.items.map((p) => {
										const qty = facilitySelections[p.id];
										return (
											<li
												key={p.id}
												className="flex items-baseline justify-between gap-4"
											>
												<span className="truncate min-w-0 text-muted-foreground">
													{p.name}
													{qty > 1 ? ` × ${qty}` : ""}
												</span>
												<span className="font-mono shrink-0 whitespace-nowrap">
													{formatGbp((p.price_cents ?? 0) * qty)}
												</span>
											</li>
										);
									})}
								</ul>
							</div>
						));
					})()}
				</div>
			)}
			{quote && (
				<div className="border-t border-foreground/10 pt-4 space-y-2 text-sm">
					{quote.discount && quote.discount.amount_cents > 0 && (
						<Row
							label={
								<span className="text-primary">
									{quote.discount.label} ({(quote.discount.percent_x100 / 100).toFixed(0)}% off)
								</span>
							}
							value={
								<span className="text-primary">
									−{formatGbp(quote.discount.amount_cents)}
								</span>
							}
						/>
					)}
					{quote.ticketing?.enabled && (quote.ticketing.setup_fee_cents ?? 0) > 0 && (
						<Row
							label={`Ticketing setup (${(quote.ticketing.setup_fee_pct_x100 / 100).toFixed(0)}%)`}
							value={formatGbp(quote.ticketing.setup_fee_cents)}
						/>
					)}
					{quote.subtotal_cents > 0 && quote.vat_cents > 0 && (
						<>
							<Row label="Subtotal" value={formatGbp(quote.subtotal_cents)} />
							<Row label="VAT" value={formatGbp(quote.vat_cents)} />
						</>
					)}
					<Row
						label={<span className="font-medium text-foreground">Total</span>}
						value={
							<span className="font-display text-2xl">
								{formatGbp(quote.total_cents)}
							</span>
						}
					/>
					{quote.deposit_required_cents > 0 && (
						<div className="border-t border-foreground/10 pt-3 mt-3">
							<Row
								label="Deposit on approval"
								value={formatGbp(quote.deposit_required_cents)}
								muted
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function SegmentBreakdown({ segment }) {
	if (segment?.error) {
		return (
			<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
				{segment.error}
			</div>
		);
	}
	const dateLabel = formatVenueDate(segment.starts_at);
	const timeLabel = `${formatVenueTime(segment.starts_at)}-${formatVenueTime(segment.ends_at)}`;
	const breakdown = segment.band_breakdown ?? [];
	const cappedTotal =
		segment.daily_cap_applied && segment.daily_cap_cents != null
			? segment.daily_cap_cents
			: null;

	return (
		<div className="space-y-1.5 text-sm">
			<div className="flex items-baseline justify-between gap-3">
				<span className="font-medium truncate min-w-0">{dateLabel}</span>
				<span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
					{timeLabel}
				</span>
			</div>
			<ul className="space-y-1">
				{breakdown.map((b, i) => (
					<li
						key={i}
						className={`flex items-baseline justify-between gap-3 text-xs ${
							b.is_top_up ? "text-muted-foreground italic" : "text-muted-foreground"
						}`}
					>
						<span className="truncate min-w-0">
							{b.label} · {formatHours(b.hours)} × {formatGbp(b.unit_price_cents)}
						</span>
						<span
							className={`font-mono shrink-0 whitespace-nowrap ${
								cappedTotal != null ? "line-through text-muted-foreground/60" : "text-foreground/85"
							}`}
						>
							{formatGbp(b.total_cents)}
						</span>
					</li>
				))}
			</ul>
			{cappedTotal != null && (
				<div className="flex items-baseline justify-between gap-3 text-xs">
					<span className="text-primary truncate min-w-0">Daily cap applied</span>
					<span className="font-mono shrink-0 whitespace-nowrap text-primary">
						{formatGbp(cappedTotal)}
					</span>
				</div>
			)}
		</div>
	);
}

function CheckIndicator({ checked, className = "" }) {
	return (
		<span
			aria-hidden
			className={`grid h-4 w-4 shrink-0 place-content-center rounded-sm border ${
				checked ? "border-primary bg-primary text-primary-foreground" : "border-foreground/40"
			} ${className}`}
		>
			{checked && (
				<svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
					<path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			)}
		</span>
	);
}

function Row({ label, value, muted = false }) {
	return (
		<div className={`flex items-baseline justify-between gap-4 ${muted ? "text-muted-foreground" : ""}`}>
			<span className="truncate min-w-0">{label}</span>
			<span className="font-mono shrink-0 whitespace-nowrap">{value}</span>
		</div>
	);
}
