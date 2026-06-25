"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shadcn/components/ui/tabs";
import FileUpload from "@/global/ui/components/file-upload";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import {
	DateTimePicker,
	splitDateTime,
	combineDateTime,
} from "@/global/ui/components/date-time-picker";
import { saveOrganisationAction } from "@/app/(protected)/admin/crm/actions";
import { ORGANISATION_KINDS } from "@/db/schema/entities/organisation.js";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/shadcn/components/ui/dialog";
import { toast } from "sonner";
import {
	saveEventAction,
	deleteEventAction,
	cancelEventAction,
	saveEventFaqsAction,
	saveTicketTypesAction,
} from "../actions";
import AddonsTab from "./addons-tab";
import BundlesTab from "./bundles-tab";
import DiscountsTab from "./discounts-tab";
import OrdersTab from "./orders-tab";
import OverviewTab from "./overview-tab";

const NO_VAT = "__none__";

const NO_ORGANISER = "__none__";
const NO_ORGANISATION = "__none__";
const CREATE_ORGANISATION = "__create__";

const STATUS_OPTIONS = [
	{ value: "draft", label: "Draft" },
	{ value: "pending_review", label: "Pending review" },
	{ value: "published", label: "Published" },
	{ value: "cancelled", label: "Cancelled" },
];
const VISIBILITY_OPTIONS = [
	{ value: "private", label: "Private" },
	{ value: "public", label: "Public (shows on /whats-on)" },
];

function toIsoLocal(d) {
	if (!d) return "";
	const dt = new Date(d);
	if (Number.isNaN(dt.valueOf())) return "";
	const pad = (n) => String(n).padStart(2, "0");
	return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function msOf(v) {
	if (!v) return null;
	const t = new Date(v).getTime();
	return Number.isFinite(t) ? t : null;
}

/**
 * "When" field validation:
 *   - Each time, if set, must fall inside one of the booking's event-day
 *     windows. Setup, teardown, and rehearsal segments are excluded
 *     upstream (server only feeds us `booking_type_key === "event"` rows).
 *   - The order is enforced: doors_open_at ≤ starts_at ≤ ends_at.
 *
 * When `eventDayWindows` is empty (event with no linked booking, or a
 * booking with no event-day segments yet) only the ordering applies.
 */
function deriveWhenErrors(draft, eventDayWindows) {
	const doors = msOf(draft.doors_open_at);
	const starts = msOf(draft.starts_at);
	const ends = msOf(draft.ends_at);
	const windows = (eventDayWindows ?? [])
		.map((w) => ({ start: msOf(w.starts_at), end: msOf(w.ends_at) }))
		.filter((w) => w.start != null && w.end != null);

	function outOfWindow(t) {
		if (t == null || windows.length === 0) return false;
		return !windows.some((w) => t >= w.start && t <= w.end);
	}

	const errors = {};
	if (outOfWindow(doors)) errors.doors_open_at = "Doors must be inside the booking's event-day window.";
	if (outOfWindow(starts)) errors.starts_at = "Start time must be inside the booking's event-day window.";
	if (outOfWindow(ends)) errors.ends_at = "End time must be inside the booking's event-day window.";

	if (doors != null && starts != null && doors > starts) {
		errors.doors_open_at = errors.doors_open_at || "Doors must be on or before the start time.";
	}
	if (starts != null && ends != null && starts > ends) {
		errors.ends_at = errors.ends_at || "End time must be on or after the start time.";
	}
	if (doors != null && ends != null && doors > ends) {
		errors.doors_open_at = errors.doors_open_at || "Doors must be on or before the end time.";
	}
	return errors;
}

const stampHintFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

export default function EventEditor({
	initialEvent,
	initialFaqs = [],
	initialTicketTypes = [],
	initialAddonGroups = [],
	initialAddons = [],
	initialBundles = [],
	initialDiscounts = [],
	initialBanner = null,
	initialRoomIds = [],
	initialOrders = [],
	initialLinkedExpenses = [],
	linkedBooking = null,
	linkedOrganisation = null,
	eventDayWindows = [],
	rooms = [],
	vatRates = [],
	organisers = [],
	organisations = [],
	surface = "admin", // "admin" | "hirer"
	onSubmitForReview = null, // hirer-only: async () => void
	onSaveBasics = saveEventAction, // override on hirer surface
	bookingStatus = null, // booking row's status when the event is booking-linked
	setupMode = false, // when true: render as a stepped post-wizard setup flow
	backHref = "/admin/events",
	backLabel = "← All events",
}) {
	const isHirer = surface === "hirer";
	const router = useRouter();
	const isNew = !initialEvent?.id;
	const isPublished = initialEvent?.status === "published";

	const hasOrders = (initialOrders?.length ?? 0) > 0;
	const showOverview = !isNew;
	const TICKETING_TABS = ["tickets", "addons", "bundles", "discounts", "orders", "overview"];

	const pathname = usePathname();
	const searchParams = useSearchParams();
	const urlTab = searchParams?.get("tab");

	// Setup mode flows through these tabs in order, ending at a "submit" step.
	const SETUP_STEPS = [
		{ key: "page", label: "Page" },
		{ key: "tickets", label: "Tickets" },
		{ key: "addons", label: "Add-ons" },
		{ key: "discounts", label: "Discounts" },
		{ key: "submit", label: "Submit" },
	];

	const defaultTab = setupMode
		? "page"
		: showOverview
			? "overview"
			: "page";
	const initialTab =
		!setupMode &&
		urlTab &&
		(urlTab === "page" || urlTab === "faqs" || TICKETING_TABS.includes(urlTab))
			? urlTab
			: defaultTab;
	const [tab, setTabState] = useState(initialTab);

	const currentSetupStepIndex = setupMode
		? Math.max(0, SETUP_STEPS.findIndex((s) => s.key === tab))
		: -1;

	function setTab(next) {
		setTabState(next);
		const params = new URLSearchParams(searchParams?.toString() ?? "");
		if (next === defaultTab) params.delete("tab");
		else params.set("tab", next);
		const qs = params.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	}

	const [draft, setDraft] = useState(() => ({
		id: initialEvent?.id ?? null,
		slug: initialEvent?.slug ?? "",
		title: initialEvent?.title ?? "",
		summary: initialEvent?.summary ?? "",
		body_blocks: initialEvent?.body_blocks ?? [],
		extra_info_blocks: initialEvent?.extra_info_blocks ?? [],
		banner_file_id: initialEvent?.banner_file_id ?? null,
		hero_file_id: initialEvent?.hero_file_id ?? null,
		gallery_photo_file_id: initialEvent?.gallery_photo_file_id ?? null,
		gallery_photo_url: initialEvent?.gallery_photo_url ?? null,
		starts_at: toIsoLocal(initialEvent?.starts_at),
		ends_at: toIsoLocal(initialEvent?.ends_at),
		doors_open_at: toIsoLocal(initialEvent?.doors_open_at),
		visibility: initialEvent?.visibility ?? "private",
		status: initialEvent?.status ?? "draft",
		is_ticketed: !!initialEvent?.is_ticketed,
		max_occupancy: initialEvent?.max_occupancy ?? "",
		fee_pass_through: !!initialEvent?.fee_pass_through,
		event_organiser_id: initialEvent?.event_organiser_id ?? null,
		organiser_organisation_id: initialEvent?.organiser_organisation_id ?? null,
		external_url: initialEvent?.external_url ?? "",
		// Carry the booking link through the draft so saves don't strip it.
		// The field isn't user-editable from this form, but it has to be in
		// the payload otherwise the server action nullifies it on every save.
		booking_id: initialEvent?.booking_id ?? null,
	}));
	// Validate the "When" pickers against the booking's event-day window
	// and the natural doors ≤ start ≤ end ordering. Errors render inline
	// under each field and gate the Save button so a bad time can't
	// reach the server.
	const whenErrors = useMemo(
		() => deriveWhenErrors(draft, eventDayWindows),
		[draft.doors_open_at, draft.starts_at, draft.ends_at, eventDayWindows],
	);
	const hasWhenErrors =
		!!whenErrors.doors_open_at || !!whenErrors.starts_at || !!whenErrors.ends_at;

	const [banner, setBanner] = useState(initialBanner);
	const [faqs, setFaqs] = useState(initialFaqs);
	const [ticketTypes, setTicketTypes] = useState(initialTicketTypes);
	const [roomIds, setRoomIds] = useState(initialRoomIds ?? []);

	const [saving, setSaving] = useState(false);
	const [savedMsg, setSavedMsg] = useState(null);
	const [error, setError] = useState(null);

	const [orgList, setOrgList] = useState(organisations);
	const [newOrgDraft, setNewOrgDraft] = useState(null);
	const [creatingOrg, setCreatingOrg] = useState(false);

	function update(field, value) {
		setDraft((d) => ({ ...d, [field]: value }));
	}

	async function saveNewOrganisation() {
		if (!newOrgDraft?.name?.trim()) return;
		setCreatingOrg(true);
		try {
			const res = await saveOrganisationAction({
				name: newOrgDraft.name.trim(),
				kind: newOrgDraft.kind,
				notes: newOrgDraft.notes?.trim() || null,
			});
			const created = {
				id: res.id,
				name: newOrgDraft.name.trim(),
				kind: newOrgDraft.kind,
			};
			setOrgList((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
			update("organiser_organisation_id", created.id);
			setNewOrgDraft(null);
			toast.success("Organisation added");
		} catch (err) {
			toast.error(err?.message || "Couldn't create organisation");
		} finally {
			setCreatingOrg(false);
		}
	}

	function addMinutesToTime(time, minutes) {
		if (!time) return "";
		const [h, m] = time.split(":").map(Number);
		if (Number.isNaN(h) || Number.isNaN(m)) return "";
		let total = h * 60 + m + minutes;
		total = ((total % 1440) + 1440) % 1440;
		const pad = (n) => String(n).padStart(2, "0");
		return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
	}

	function cascadeDoorsDate(nextDate) {
		if (!nextDate) return;
		setDraft((d) => {
			const next = { ...d };
			const starts = splitDateTime(d.starts_at);
			const ends = splitDateTime(d.ends_at);
			if (!starts.date) next.starts_at = combineDateTime(nextDate, starts.time);
			if (!ends.date) {
				const baseDate = splitDateTime(next.starts_at).date || nextDate;
				next.ends_at = combineDateTime(baseDate, ends.time);
			}
			return next;
		});
	}

	function cascadeDoorsTime(nextTime) {
		if (!nextTime) return;
		setDraft((d) => {
			const next = { ...d };
			const startsTime = addMinutesToTime(nextTime, 30);
			const endsTime = addMinutesToTime(startsTime, 120);
			const starts = splitDateTime(d.starts_at);
			const ends = splitDateTime(d.ends_at);
			next.starts_at = combineDateTime(starts.date, startsTime);
			next.ends_at = combineDateTime(ends.date, endsTime);
			return next;
		});
	}

	function cascadeStartsTime(nextTime) {
		if (!nextTime) return;
		setDraft((d) => {
			const next = { ...d };
			const endsTime = addMinutesToTime(nextTime, 120);
			const ends = splitDateTime(d.ends_at);
			next.ends_at = combineDateTime(ends.date, endsTime);
			return next;
		});
	}

	async function saveBasics(extras = {}) {
		setSaving(true);
		setError(null);
		try {
			// Only persist datetimes that include a time. Date-only values mean
			// "user hasn't finished picking" - save as null so the DB doesn't end
			// up with misleading midnight stamps.
			const onlyComplete = (v) => (typeof v === "string" && v.includes("T") ? v : null);
			const payload = {
				...draft,
				...extras,
				summary: draft.summary || null,
				external_url: draft.external_url || null,
				starts_at: onlyComplete(draft.starts_at),
				ends_at: onlyComplete(draft.ends_at),
				doors_open_at: onlyComplete(draft.doors_open_at),
				max_occupancy: draft.max_occupancy === "" ? null : draft.max_occupancy,
				room_ids: roomIds,
			};
			const saved = await onSaveBasics(payload);
			setDraft((d) => ({ ...d, id: saved.id, slug: saved.slug }));
			setSavedMsg("Saved.");
			setTimeout(() => setSavedMsg(null), 1500);
			if (isNew && saved.id) {
				router.replace(`/admin/events/${saved.id}`);
			} else {
				router.refresh();
			}
			return saved;
		} catch (err) {
			setError(err?.message || "Save failed");
		} finally {
			setSaving(false);
		}
	}

	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
	const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

	async function performDelete() {
		if (!draft.id) return;
		await deleteEventAction(draft.id);
		router.replace("/admin/events");
	}

	async function performCancel() {
		if (!draft.id) return;
		await cancelEventAction(draft.id);
		setDraft((d) => ({ ...d, status: "cancelled" }));
		router.refresh();
	}

	function handleBannerUploaded(record) {
		setBanner(record);
		update("banner_file_id", record.id);
	}

	const eventId = draft.id;

	return (
		<div className={isHirer ? "" : "mx-auto p-6 lg:p-10 max-w-5xl"}>
			<div
				className={
					isHirer
						? "pb-4 border-b border-foreground/10 mb-8"
						: "sticky top-0 -mx-6 lg:-mx-10 px-6 lg:px-10 pb-4 pt-6 lg:pt-10 -mt-6 lg:-mt-10 bg-background/85 backdrop-blur z-20 border-b border-foreground/10 mb-8"
				}
			>
				<div className="flex items-start justify-between gap-4 flex-wrap">
					<div className="min-w-0">
						{!isHirer && (
							<Link
								href={backHref}
								className="text-sm text-muted-foreground hover:text-foreground"
							>
								{backLabel}
							</Link>
						)}
						<div className={`${isHirer ? "" : "mt-2 "}flex items-center gap-3 flex-wrap`}>
							<h1 className="text-2xl font-semibold truncate">
								{isNew ? "New event" : draft.title || "Untitled"}
							</h1>
							{!isNew && (
								<span className="inline-flex items-center rounded-full border border-foreground/15 bg-muted px-2.5 py-0.5 text-xs text-muted-foreground capitalize">
									{draft.status?.replace("_", " ")}
								</span>
							)}
						</div>
					</div>
					<div className="flex items-center gap-2">
						{savedMsg && <span className="text-xs text-muted-foreground">{savedMsg}</span>}
						{!isHirer && !isNew && draft.status !== "cancelled" && (
							<Button
								variant="outline"
								onClick={() => setConfirmCancelOpen(true)}
								disabled={saving}
							>
								Cancel event
							</Button>
						)}
						{!isHirer && !isNew && (
							<Button variant="outline" onClick={() => setConfirmDeleteOpen(true)} disabled={saving}>
								Delete
							</Button>
						)}
						<Button
							variant={isHirer && !isPublished ? "outline" : "default"}
							onClick={() => saveBasics()}
							disabled={saving || !draft.title || hasWhenErrors}
							title={hasWhenErrors ? "Fix the times in 'When' before saving." : undefined}
						>
							{saving ? "Saving…" : isHirer && !isPublished ? "Save draft" : "Save"}
						</Button>
						{isHirer && !isNew && !setupMode && !isPublished && onSubmitForReview && (() => {
							const bookingGated =
								!!initialEvent?.booking_id &&
								bookingStatus !== "confirmed" &&
								bookingStatus !== "completed";
							return (
								<Button
									onClick={async () => {
										await saveBasics();
										await onSubmitForReview();
									}}
									disabled={saving || !draft.title || bookingGated || hasWhenErrors}
									title={
										bookingGated
											? "Submit for approval is unlocked once your booking deposit is paid."
											: undefined
									}
								>
									Submit for approval
								</Button>
							);
						})()}
					</div>
				</div>
			</div>

			{error && (
				<div className="mb-6 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
					{error}
				</div>
			)}

			{setupMode && (
				<div className="mb-6 rounded-lg border border-foreground/10 bg-card p-4">
					<ol className="flex flex-wrap items-center gap-2 text-xs">
						{SETUP_STEPS.map((s, i) => {
							const done = i < currentSetupStepIndex;
							const active = i === currentSetupStepIndex;
							return (
								<li key={s.key} className="flex items-center gap-2">
									<span
										className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
											active
												? "bg-primary/15 text-primary font-medium"
												: done
													? "text-foreground/85"
													: "text-muted-foreground"
										}`}
									>
										<span className="font-mono">{i + 1}</span>
										{s.label}
									</span>
									{i < SETUP_STEPS.length - 1 && (
										<span aria-hidden className="text-muted-foreground/50">
											→
										</span>
									)}
								</li>
							);
						})}
					</ol>
				</div>
			)}

			<Tabs value={tab} onValueChange={setTab} className="space-y-8">
				<TabsList
					className={`flex flex-wrap items-center gap-1${setupMode ? " hidden" : ""}`}
				>
					{showOverview && (
						<>
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<span aria-hidden className="mx-2 h-5 w-px bg-foreground/20" />
						</>
					)}
					<TabsTrigger value="page">Page</TabsTrigger>
					<TabsTrigger value="faqs" disabled={isNew}>FAQs</TabsTrigger>
					<TabsTrigger
						value="tickets"
						disabled={isNew || !draft.is_ticketed}
						title={!draft.is_ticketed ? "Enable 'This event sells tickets' on the Page tab first." : undefined}
					>
						Tickets
					</TabsTrigger>
					<TabsTrigger
						value="addons"
						disabled={isNew || !draft.is_ticketed}
						title={!draft.is_ticketed ? "Enable 'This event sells tickets' on the Page tab first." : undefined}
					>
						Add-ons
					</TabsTrigger>
					<TabsTrigger
						value="bundles"
						disabled={isNew || !draft.is_ticketed}
						title={!draft.is_ticketed ? "Enable 'This event sells tickets' on the Page tab first." : undefined}
					>
						Bundles
					</TabsTrigger>
					<TabsTrigger
						value="discounts"
						disabled={isNew || !draft.is_ticketed}
						title={!draft.is_ticketed ? "Enable 'This event sells tickets' on the Page tab first." : undefined}
					>
						Discounts
					</TabsTrigger>
					{!isHirer && (
						<>
							<span
								aria-hidden
								className="mx-2 h-5 w-px bg-foreground/20"
							/>
							<TabsTrigger
								value="orders"
								disabled={isNew || !draft.is_ticketed}
								title={!draft.is_ticketed ? "Enable 'This event sells tickets' on the Page tab first." : undefined}
							>
								Orders
							</TabsTrigger>
						</>
					)}
				</TabsList>

				<TabsContent value="page" className="space-y-8">
					<section className="rounded-lg border bg-card p-6 space-y-5">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Banner</h2>
						{banner?.public_url && (
							<div className="relative aspect-3/1 overflow-hidden rounded-md border border-foreground/10 bg-muted/30">
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img src={banner.public_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
							</div>
						)}
						<FileUpload
							fileType="event-hero"
							accept="image/*"
							label={banner ? "Replace banner" : "Upload banner"}
							onUploaded={handleBannerUploaded}
						/>
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-5">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
							Photo from the event
						</h2>
						<p className="text-sm text-muted-foreground">
							Upload a photo taken at the actual event. Used on the room page's
							"what's already happened here" gallery, preferred over the promo
							banner. Skip if you only have promo art.
						</p>
						{draft.gallery_photo_url && (
							<div className="relative aspect-square w-48 overflow-hidden rounded-md border border-foreground/10 bg-muted/30">
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={draft.gallery_photo_url}
									alt=""
									className="absolute inset-0 w-full h-full object-cover"
								/>
							</div>
						)}
						<FileUpload
							fileType="event-hero"
							accept="image/*"
							label={draft.gallery_photo_url ? "Replace photo" : "Upload photo"}
							onUploaded={(record) => {
								update("gallery_photo_file_id", record.id);
								update("gallery_photo_url", record.public_url);
							}}
						/>
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-5">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Basics</h2>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2 sm:col-span-2">
								<Label>Title</Label>
								<Input
									value={draft.title}
									onChange={(e) => update("title", e.target.value)}
								/>
								<p className="text-xs text-muted-foreground">
									Public URL:{" "}
									{draft.slug ? (
										<span className="font-mono">/events/{draft.slug}</span>
									) : (
										<span className="italic">Generated automatically on save.</span>
									)}
								</p>
							</div>
							{!isHirer && (
								<div className="space-y-2 sm:col-span-2">
									<Label>
										CRM organisation
										{!initialEvent?.booking_id && (
											<span className="text-destructive ml-0.5">*</span>
										)}
									</Label>
									<Select
										value={draft.organiser_organisation_id ?? NO_ORGANISATION}
										onValueChange={(v) => {
											if (v === CREATE_ORGANISATION) {
												setNewOrgDraft({ name: "", kind: "business", notes: "" });
												return;
											}
											update(
												"organiser_organisation_id",
												v === NO_ORGANISATION ? null : v,
											);
										}}
									>
										<SelectTrigger>
											<SelectValue placeholder="Pick the organisation running this event" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NO_ORGANISATION}>None</SelectItem>
											{orgList.map((o) => (
												<SelectItem key={o.id} value={o.id}>
													{o.name}
												</SelectItem>
											))}
											<SelectItem value={CREATE_ORGANISATION}>+ Create new…</SelectItem>
										</SelectContent>
									</Select>
									<p className="text-xs text-muted-foreground">
										CRM link used for revenue roll-ups and director reports.
										{initialEvent?.booking_id
											? " Inherited from the linked booking; change if needed."
											: " Required for events without a linked booking."}
									</p>
								</div>
							)}
							{!isHirer && (
								<div className="space-y-2 sm:col-span-2">
									<Label>Event organiser (public)</Label>
									<Select
										value={draft.event_organiser_id ?? NO_ORGANISER}
										onValueChange={(v) =>
											update("event_organiser_id", v === NO_ORGANISER ? null : v)
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Optional - public-facing branded organiser" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NO_ORGANISER}>None</SelectItem>
											{organisers.map((o) => (
												<SelectItem key={o.id} value={o.id}>
													{o.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<p className="text-xs text-muted-foreground">
										Optional branded entity shown on the public event page (e.g. promoter
										name and booking-fee copy).
									</p>
								</div>
							)}
							{!isHirer && (
								<div className="space-y-2">
									<Label>Status</Label>
									<Select value={draft.status} onValueChange={(v) => update("status", v)}>
										<SelectTrigger><SelectValue /></SelectTrigger>
										<SelectContent>
											{STATUS_OPTIONS.map((o) => (
												<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
							{!isHirer && (
								<div className="space-y-2">
									<Label>Visibility</Label>
									<Select value={draft.visibility} onValueChange={(v) => update("visibility", v)}>
										<SelectTrigger><SelectValue /></SelectTrigger>
										<SelectContent>
											{VISIBILITY_OPTIONS.map((o) => (
												<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
							<div className="flex items-center gap-2 sm:col-span-2">
								<Checkbox
									id="is_ticketed"
									checked={!!draft.is_ticketed}
									onCheckedChange={(v) => {
										const next = !!v;
										update("is_ticketed", next);
										if (!next && TICKETING_TABS.includes(tab)) setTab("page");
									}}
								/>
								<Label htmlFor="is_ticketed">This event sells tickets</Label>
							</div>
							<div className="space-y-2 sm:col-span-2">
								<Label>Max occupancy (optional)</Label>
								<Input
									type="number"
									min="0"
									placeholder="No limit"
									value={draft.max_occupancy ?? ""}
									onChange={(e) =>
										update(
											"max_occupancy",
											e.target.value === "" ? "" : Math.max(0, Math.round(Number(e.target.value))),
										)
									}
									disabled={!draft.is_ticketed}
								/>
								<p className="text-xs text-muted-foreground">
									Total delegates allowed across all ticket types. Counts each ticket by its
									&quot;admits per ticket&quot; setting - so a family-of-4 ticket uses 4 of the
									available occupancy.
								</p>
							</div>
							<div className="flex items-start gap-2 sm:col-span-2 pt-2 border-t border-foreground/10">
								<Checkbox
									id="fee_pass_through"
									checked={!!draft.fee_pass_through}
									onCheckedChange={(v) => update("fee_pass_through", !!v)}
									className="mt-0.5"
									disabled={!draft.is_ticketed}
								/>
								<div>
									<Label htmlFor="fee_pass_through">
										Add the booking fee to the customer&apos;s total
									</Label>
									<p className="text-xs text-muted-foreground mt-0.5">
										When ticked, the platform processing fee (set in{" "}
										Settings &rarr; Ticketing) is added on top of the ticket price.
										When unticked, the organiser absorbs the fee and the customer is
										offered an opt-in to cover it.
									</p>
								</div>
							</div>
							<div className="space-y-2 sm:col-span-2">
								<Label>Summary / description</Label>
								<Textarea
									rows={8}
									value={draft.summary ?? ""}
									onChange={(e) => update("summary", e.target.value)}
									placeholder="Short hook used in listings - and the longer description shown on the event page. Line breaks are preserved."
								/>
								<p className="text-xs text-muted-foreground">
									New lines are preserved when this renders on the public event page.
								</p>
							</div>
						</div>
					</section>

					{!isHirer && (
						<section className="rounded-lg border bg-card p-6 space-y-5">
							<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Rooms</h2>
							{initialEvent?.booking_id ? (
								<p className="text-sm text-muted-foreground">
									This event is tied to a booking - rooms come from the booking&apos;s
									segments and can&apos;t be changed here.
								</p>
							) : (
								<>
									<p className="text-xs text-muted-foreground">
										Pick the room(s) this event uses. Picked rooms are blocked from
										public bookings during the event window. Leave all unticked if the
										event doesn&apos;t use any rooms (e.g. external venue).
									</p>
									<div className="grid gap-2 sm:grid-cols-2">
										{rooms.map((r) => {
											const checked = roomIds.includes(r.id);
											return (
												<label
													key={r.id}
													className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer ${
														checked
															? "border-primary bg-primary/5"
															: "border-foreground/10 hover:border-foreground/30 bg-background"
													}`}
												>
													<Checkbox
														checked={checked}
														onCheckedChange={(v) => {
															setRoomIds((ids) =>
																v
																	? [...ids, r.id]
																	: ids.filter((id) => id !== r.id),
															);
														}}
													/>
													<span className="text-sm truncate">{r.name}</span>
												</label>
											);
										})}
									</div>
								</>
							)}
						</section>
					)}

					<section className="rounded-lg border bg-card p-6 space-y-5">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">When</h2>
						{eventDayWindows.length > 0 && (
							<div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
								<div className="text-muted-foreground">
									Pick times inside the booking&apos;s event-day window
									{eventDayWindows.length > 1 ? "s" : ""}:
								</div>
								<ul className="mt-1 space-y-0.5">
									{eventDayWindows.map((w, i) => (
										<li key={i} className="font-mono">
											{stampHintFmt.format(new Date(w.starts_at))} → {stampHintFmt.format(new Date(w.ends_at))}
										</li>
									))}
								</ul>
							</div>
						)}
						<div className="space-y-4">
							<div className="space-y-2">
								<Label>Doors open</Label>
								<DateTimePicker
									value={draft.doors_open_at ?? ""}
									onChange={(v) => update("doors_open_at", v)}
									onDateChange={cascadeDoorsDate}
									onTimeChange={cascadeDoorsTime}
								/>
								{whenErrors.doors_open_at && (
									<p className="text-xs text-destructive">{whenErrors.doors_open_at}</p>
								)}
							</div>
							<div className="space-y-2">
								<Label>Starts at</Label>
								<DateTimePicker
									value={draft.starts_at ?? ""}
									onChange={(v) => update("starts_at", v)}
									onTimeChange={cascadeStartsTime}
								/>
								{whenErrors.starts_at && (
									<p className="text-xs text-destructive">{whenErrors.starts_at}</p>
								)}
							</div>
							<div className="space-y-2">
								<Label>Ends at</Label>
								<DateTimePicker
									value={draft.ends_at ?? ""}
									onChange={(v) => update("ends_at", v)}
								/>
								{whenErrors.ends_at && (
									<p className="text-xs text-destructive">{whenErrors.ends_at}</p>
								)}
							</div>
						</div>
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-5">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">External link (optional)</h2>
						<Input
							value={draft.external_url ?? ""}
							onChange={(e) => update("external_url", e.target.value)}
							placeholder="If tickets are sold elsewhere, link here instead."
						/>
					</section>
				</TabsContent>

				<TabsContent value="faqs">
					{eventId && (
						<FaqsTab
							eventId={eventId}
							initial={faqs}
							onSaved={(saved) => setFaqs(saved)}
						/>
					)}
				</TabsContent>

				<TabsContent value="tickets">
					{eventId && (
						<TicketTypesTab
							eventId={eventId}
							initial={ticketTypes}
							vatRates={vatRates}
							onSaved={(saved) => setTicketTypes(saved)}
						/>
					)}
				</TabsContent>

				<TabsContent value="addons">
					{eventId && (
						<AddonsTab
							eventId={eventId}
							initialGroups={initialAddonGroups}
							initialAddons={initialAddons}
							ticketTypes={ticketTypes}
							vatRates={vatRates}
						/>
					)}
				</TabsContent>

				<TabsContent value="bundles">
					{eventId && (
						<BundlesTab
							eventId={eventId}
							initialBundles={initialBundles}
							ticketTypes={ticketTypes}
							vatRates={vatRates}
						/>
					)}
				</TabsContent>

				<TabsContent value="discounts">
					{eventId && (
						<DiscountsTab
							eventId={eventId}
							initialDiscounts={initialDiscounts}
							ticketTypes={ticketTypes}
						/>
					)}
				</TabsContent>

				{!isHirer && (
					<TabsContent value="orders">
						<OrdersTab eventId={eventId} orders={initialOrders} />
					</TabsContent>
				)}

				{showOverview && (
					<TabsContent value="overview">
						<OverviewTab
							orders={initialOrders}
							eventId={initialEvent?.id}
							checkinCode={initialEvent?.checkin_code}
							linkedExpenses={initialLinkedExpenses}
							linkedBooking={linkedBooking}
							linkedOrganisation={linkedOrganisation}
						/>
					</TabsContent>
				)}

				{setupMode && (
					<TabsContent value="submit" className="space-y-4">
						<div className="rounded-lg border bg-card p-6 space-y-3">
							<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
								Ready to go
							</h2>
							<p className="text-sm text-muted-foreground">
								When you&apos;re happy with everything, submit the event for
								approval. We&apos;ll review and publish it on the public site.
								You can keep editing until that happens.
							</p>
							{(() => {
								const bookingGated =
									!!initialEvent?.booking_id &&
									bookingStatus !== "confirmed" &&
									bookingStatus !== "completed";
								return (
									<div className="space-y-2">
										<Button
											disabled={
												!onSubmitForReview ||
												saving ||
												!draft.title ||
												bookingGated
											}
											onClick={async () => {
												await saveBasics();
												await onSubmitForReview?.();
											}}
										>
											Submit for approval
										</Button>
										{bookingGated && (
											<p className="text-xs text-muted-foreground">
												This event can be submitted once the booking is
												confirmed (deposit paid).
											</p>
										)}
									</div>
								);
							})()}
						</div>
					</TabsContent>
				)}
			</Tabs>

			{setupMode && (
				<div className="mt-8 flex items-center justify-between gap-3 border-t border-foreground/10 pt-6">
					<Button
						variant="outline"
						onClick={() => {
							const prev = SETUP_STEPS[currentSetupStepIndex - 1];
							if (prev) setTab(prev.key);
						}}
						disabled={currentSetupStepIndex === 0}
					>
						Back
					</Button>
					<div className="text-xs text-muted-foreground">
						Save your changes on this step before continuing.
					</div>
					<Button
						onClick={() => {
							const next = SETUP_STEPS[currentSetupStepIndex + 1];
							if (next) setTab(next.key);
						}}
						disabled={currentSetupStepIndex >= SETUP_STEPS.length - 1}
					>
						Continue
					</Button>
				</div>
			)}

			<ConfirmDialog
				open={confirmDeleteOpen}
				onOpenChange={setConfirmDeleteOpen}
				title="Delete this event?"
				description={`"${draft.title || "Untitled"}" will be removed. This is reversible (soft delete).`}
				confirmLabel="Delete event"
				destructive
				onConfirm={performDelete}
			/>

			<ConfirmDialog
				open={confirmCancelOpen}
				onOpenChange={setConfirmCancelOpen}
				title="Cancel this event?"
				description={`"${draft.title || "Untitled"}" will be marked as cancelled and pulled from the public listings. The event row stays in place for reporting and refunds - use Delete to remove it entirely.`}
				confirmLabel="Cancel event"
				destructive
				onConfirm={performCancel}
			/>

			<Dialog
				open={!!newOrgDraft}
				onOpenChange={(o) => !o && !creatingOrg && setNewOrgDraft(null)}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Add CRM organisation</DialogTitle>
						<DialogDescription>
							Used for revenue roll-ups and director reports.
						</DialogDescription>
					</DialogHeader>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							saveNewOrganisation();
						}}
						className="space-y-4"
					>
						<div className="space-y-1.5">
							<Label htmlFor="new-org-name">Name</Label>
							<Input
								id="new-org-name"
								required
								autoFocus
								value={newOrgDraft?.name ?? ""}
								onChange={(e) =>
									setNewOrgDraft((d) => ({ ...d, name: e.target.value }))
								}
								disabled={creatingOrg}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="new-org-kind">Kind</Label>
							<Select
								value={newOrgDraft?.kind ?? "business"}
								onValueChange={(v) =>
									setNewOrgDraft((d) => ({ ...d, kind: v }))
								}
								disabled={creatingOrg}
							>
								<SelectTrigger id="new-org-kind">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ORGANISATION_KINDS.map((k) => (
										<SelectItem key={k} value={k}>
											{k.replace(/^./, (c) => c.toUpperCase())}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="new-org-notes">Notes (optional)</Label>
							<Textarea
								id="new-org-notes"
								rows={3}
								value={newOrgDraft?.notes ?? ""}
								onChange={(e) =>
									setNewOrgDraft((d) => ({ ...d, notes: e.target.value }))
								}
								disabled={creatingOrg}
							/>
						</div>
						<div className="flex justify-end gap-2 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setNewOrgDraft(null)}
								disabled={creatingOrg}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={creatingOrg || !newOrgDraft?.name?.trim()}
							>
								{creatingOrg ? "Saving…" : "Add organisation"}
							</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function FaqsTab({ eventId, initial, onSaved }) {
	const [rows, setRows] = useState(initial.length ? initial : []);
	const [saving, setSaving] = useState(false);
	const [savedMsg, setSavedMsg] = useState(null);
	const [error, setError] = useState(null);

	function update(i, patch) {
		setRows((xs) => xs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
	}
	function add() {
		setRows((xs) => [...xs, { id: null, question: "", answer: "" }]);
	}
	function remove(i) {
		setRows((xs) => xs.filter((_, j) => j !== i));
	}
	function move(i, dir) {
		const swap = dir === "up" ? i - 1 : i + 1;
		if (swap < 0 || swap >= rows.length) return;
		setRows((xs) => {
			const next = [...xs];
			[next[i], next[swap]] = [next[swap], next[i]];
			return next;
		});
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			const saved = await saveEventFaqsAction({
				event_id: eventId,
				faqs: rows.map((r) => ({ id: r.id, question: r.question, answer: r.answer })),
			});
			onSaved?.(saved);
			setRows(saved);
			setSavedMsg("Saved.");
			setTimeout(() => setSavedMsg(null), 1500);
		} catch (err) {
			setError(err?.message || "Save failed");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="rounded-lg border bg-card p-6 space-y-5">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">FAQs</h2>
					<p className="text-xs text-muted-foreground mt-1">
						Question and answer pairs shown on the public event page.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{savedMsg && <span className="text-xs text-muted-foreground">{savedMsg}</span>}
					<Button size="sm" onClick={save} disabled={saving}>
						{saving ? "Saving…" : "Save FAQs"}
					</Button>
				</div>
			</div>
			{error && (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}
			{rows.length === 0 && (
				<p className="text-sm text-muted-foreground">No FAQs yet.</p>
			)}
			<div className="space-y-3">
				{rows.map((r, i) => (
					<div key={r.id ?? `new-${i}`} className="rounded-md border bg-background p-4 space-y-3">
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
								FAQ {i + 1}
							</span>
							<div className="flex items-center gap-1">
								<Button variant="ghost" size="sm" onClick={() => move(i, "up")} disabled={i === 0}>↑</Button>
								<Button variant="ghost" size="sm" onClick={() => move(i, "down")} disabled={i === rows.length - 1}>↓</Button>
								<Button variant="ghost" size="sm" onClick={() => remove(i)}>Remove</Button>
							</div>
						</div>
						<div className="space-y-2">
							<Label>Question</Label>
							<Input value={r.question} onChange={(e) => update(i, { question: e.target.value })} />
						</div>
						<div className="space-y-2">
							<Label>Answer</Label>
							<Textarea
								rows={3}
								value={r.answer}
								onChange={(e) => update(i, { answer: e.target.value })}
							/>
						</div>
					</div>
				))}
			</div>
			<Button variant="outline" size="sm" onClick={add}>+ Add FAQ</Button>
		</section>
	);
}

function TicketTypesTab({ eventId, initial, vatRates, onSaved }) {
	const [rows, setRows] = useState(
		initial.map((t) => ({
			id: t.id,
			name: t.name ?? "",
			description: t.description ?? "",
			price_cents: t.price_cents ?? 0,
			vat_rate_id: t.vat_rate_id ?? null,
			vat_inclusive: !!t.vat_inclusive,
			admits_count: t.admits_count ?? 1,
			max_quantity: t.max_quantity ?? "",
			per_order_min: t.per_order_min ?? 0,
			per_order_max: t.per_order_max ?? "",
			is_active: t.is_active !== false,
		})),
	);
	const [saving, setSaving] = useState(false);
	const [savedMsg, setSavedMsg] = useState(null);
	const [error, setError] = useState(null);

	function update(i, patch) {
		setRows((xs) => xs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
	}
	function add() {
		setRows((xs) => [
			...xs,
			{
				id: null,
				name: "",
				description: "",
				price_cents: 0,
				vat_rate_id: null,
				vat_inclusive: false,
				admits_count: 1,
				max_quantity: "",
				per_order_min: 0,
				per_order_max: "",
				is_active: true,
			},
		]);
	}
	function remove(i) {
		setRows((xs) => xs.filter((_, j) => j !== i));
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			const saved = await saveTicketTypesAction({
				event_id: eventId,
				ticket_types: rows.map((r) => ({
					id: r.id,
					name: r.name,
					description: r.description || null,
					price_cents: r.price_cents,
					vat_rate_id: r.vat_rate_id,
					vat_inclusive: r.vat_inclusive,
					admits_count: r.admits_count,
					max_quantity: r.max_quantity === "" ? null : r.max_quantity,
					per_order_min: r.per_order_min,
					per_order_max: r.per_order_max === "" ? null : r.per_order_max,
					is_active: r.is_active,
				})),
			});
			onSaved?.(saved);
			setRows(
				saved.map((t) => ({
					id: t.id,
					name: t.name,
					description: t.description ?? "",
					price_cents: t.price_cents,
					vat_rate_id: t.vat_rate_id,
					vat_inclusive: t.vat_inclusive,
					admits_count: t.admits_count,
					max_quantity: t.max_quantity ?? "",
					per_order_min: t.per_order_min,
					per_order_max: t.per_order_max ?? "",
					is_active: t.is_active,
				})),
			);
			setSavedMsg("Saved.");
			setTimeout(() => setSavedMsg(null), 1500);
		} catch (err) {
			setError(err?.message || "Save failed");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="rounded-lg border bg-card p-6 space-y-5">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Ticket types</h2>
					<p className="text-xs text-muted-foreground mt-1">
						Adult, concession, etc. Each ticket type has its own price and rules.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{savedMsg && <span className="text-xs text-muted-foreground">{savedMsg}</span>}
					<Button size="sm" onClick={save} disabled={saving}>
						{saving ? "Saving…" : "Save tickets"}
					</Button>
				</div>
			</div>
			{error && (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}
			{rows.length === 0 && (
				<p className="text-sm text-muted-foreground">No ticket types yet.</p>
			)}
			<div className="space-y-4">
				{rows.map((r, i) => (
					<div key={r.id ?? `new-${i}`} className="rounded-md border bg-background p-5 space-y-4">
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-3">
								<Checkbox
									checked={r.is_active}
									onCheckedChange={(v) => update(i, { is_active: !!v })}
								/>
								<span className="text-xs uppercase tracking-[0.18em] text-primary">
									{r.is_active ? "Active" : "Hidden"}
								</span>
							</div>
							<Button variant="ghost" size="sm" onClick={() => remove(i)}>Remove</Button>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label>Name</Label>
								<Input value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
							</div>
							<div className="space-y-2">
								<Label>Price (£)</Label>
								<Input
									type="number"
									min="0"
									step="0.01"
									value={(r.price_cents / 100).toString()}
									onChange={(e) =>
										update(i, { price_cents: Math.round(Number(e.target.value || 0) * 100) })
									}
								/>
								<p className="text-xs text-muted-foreground">{formatGbp(r.price_cents)}</p>
							</div>
							<div className="space-y-2">
								<Label>VAT</Label>
								<Select
									value={r.vat_rate_id ?? NO_VAT}
									onValueChange={(v) => update(i, { vat_rate_id: v === NO_VAT ? null : v })}
								>
									<SelectTrigger><SelectValue /></SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_VAT}>No VAT</SelectItem>
										{vatRates.map((vr) => (
											<SelectItem key={vr.id} value={vr.id}>{vr.label}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex items-end gap-2 pb-1">
								<Checkbox
									id={`vat-inc-${i}`}
									checked={!!r.vat_inclusive}
									onCheckedChange={(v) => update(i, { vat_inclusive: !!v })}
								/>
								<Label htmlFor={`vat-inc-${i}`}>Price includes VAT</Label>
							</div>
							<div className="space-y-2">
								<Label>Admits per ticket</Label>
								<Input
									type="number"
									min="1"
									max="50"
									value={r.admits_count}
									onChange={(e) => update(i, { admits_count: Math.max(1, Number(e.target.value || 1)) })}
								/>
								<p className="text-xs text-muted-foreground">
									E.g. a "family" ticket admits 4. Defaults to 1.
								</p>
							</div>
							<div className="space-y-2">
								<Label>Total available (optional)</Label>
								<Input
									type="number"
									min="0"
									placeholder="Unlimited"
									value={r.max_quantity}
									onChange={(e) => update(i, { max_quantity: e.target.value === "" ? "" : Number(e.target.value) })}
								/>
							</div>
							<div className="space-y-2 sm:col-span-2">
								<Label>Description (optional)</Label>
								<Input
									value={r.description}
									onChange={(e) => update(i, { description: e.target.value })}
								/>
							</div>
						</div>
					</div>
				))}
			</div>
			<Button variant="outline" size="sm" onClick={add}>+ Add ticket type</Button>
		</section>
	);
}
