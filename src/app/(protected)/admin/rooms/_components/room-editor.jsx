"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Label } from "@/shadcn/components/ui/label";
import { Checkbox } from "@/shadcn/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shadcn/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shadcn/components/ui/select";
import FileUpload from "@/global/ui/components/file-upload";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { byPrefixAndName } from "@awesome.me/kit-71c392801a/icons";
import {
	saveRoomAction,
	deleteRoomAction,
	upsertBlockAction,
	deleteBlockAction,
	moveBlockAction,
	addRoomImageAction,
	updateRoomImageAction,
	deleteRoomImageAction,
	moveRoomImageAction,
	saveFacilityPackageAction,
	deleteFacilityPackageAction,
	moveFacilityPackageAction,
	saveFacilityGroupAction,
	deleteFacilityGroupAction,
	setRoomBookingTypesAction,
} from "../actions";
import RoomPricingEditor from "./room-pricing-editor";

const NO_VAT = "__none__";
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

function slugify(s) {
	return String(s || "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export default function RoomEditor({
	initialRoom,
	initialBlocks,
	initialHero,
	initialImages,
	initialFacilityPackages = [],
	initialFacilityGroups = [],
	initialOfferedTypeIds = [],
	facilityCategories = [],
	layouts,
	pricingRules = [],
	bookingTypes = [],
	vatRates = [],
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);
	const [tab, setTab] = useState("details");

	const isNew = !initialRoom?.id;

	const [room, setRoom] = useState(() => ({
		id: initialRoom?.id ?? null,
		slug: initialRoom?.slug ?? "",
		name: initialRoom?.name ?? "",
		tagline: initialRoom?.tagline ?? "",
		short_description: initialRoom?.short_description ?? "",
		hero_file_id: initialRoom?.hero_file_id ?? null,
		av_highlight: initialRoom?.av_highlight ?? "",
		accent_hue: initialRoom?.accent_hue ?? "",
		allow_ticketed_events: initialRoom?.allow_ticketed_events ?? false,
		ticketing_setup_fee_pct_x100: initialRoom?.ticketing_setup_fee_pct_x100 ?? 0,
		buffer_minutes: initialRoom?.buffer_minutes ?? 60,
		sort_order: initialRoom?.sort_order ?? 0,
		is_published: initialRoom?.is_published ?? false,
	}));

	const [capacities, setCapacities] = useState(() => {
		const map = new Map();
		(initialRoom?.capacities ?? []).forEach((c) => map.set(c.layout_id, c.value));
		return layouts.map((l) => ({
			layout_id: l.id,
			key: l.key,
			label: l.label,
			icon: l.icon,
			enabled: map.has(l.id),
			value: map.has(l.id) ? String(map.get(l.id)) : "",
		}));
	});

	const [hero, setHero] = useState(initialHero ?? null);
	const [blocks, setBlocks] = useState(initialBlocks ?? []);
	const [images, setImages] = useState(initialImages ?? []);
	const [facilityPackages, setFacilityPackages] = useState(initialFacilityPackages ?? []);
	const [facilityGroups, setFacilityGroups] = useState(initialFacilityGroups ?? []);
	const [offeredTypeIds, setOfferedTypeIds] = useState(new Set(initialOfferedTypeIds ?? []));
	const [savingTypes, setSavingTypes] = useState(false);

	const aboutBlocks = blocks
		.filter((b) => (b.section ?? "about") === "about" && b.type === "prose")
		.sort((a, b) => a.sort_order - b.sort_order);

	const facilityPackagesByCategory = facilityCategories.map((c) => ({
		category: c,
		packages: facilityPackages
			.filter((p) => p.category_id === c.id)
			.sort((a, b) => a.sort_order - b.sort_order),
	}));

	function update(field, value) {
		setRoom((r) => ({ ...r, [field]: value }));
	}

	function autofillSlug() {
		if (!room.slug && room.name) update("slug", slugify(room.name));
	}

	function setCapacityValue(layoutId, value) {
		setCapacities((cs) => cs.map((c) => (c.layout_id === layoutId ? { ...c, value } : c)));
	}

	function setCapacityEnabled(layoutId, enabled) {
		setCapacities((cs) =>
			cs.map((c) => (c.layout_id === layoutId ? { ...c, enabled } : c)),
		);
	}

	async function handleSave() {
		setSaving(true);
		setError(null);
		try {
			const payload = {
				...room,
				capacities: capacities
					.filter((c) => c.enabled)
					.map((c) => ({
						layout_id: c.layout_id,
						value: c.value === "" ? null : c.value,
					})),
			};
			const saved = await saveRoomAction(payload);
			setRoom((r) => ({ ...r, id: saved.id, slug: saved.slug }));
			if (isNew) {
				router.replace(`/admin/rooms/${saved.id}`);
			} else {
				router.refresh();
			}
		} catch (err) {
			setError(err?.message || "Save failed");
		} finally {
			setSaving(false);
		}
	}

	const [confirmRoomDeleteOpen, setConfirmRoomDeleteOpen] = useState(false);
	const [confirmBlockDelete, setConfirmBlockDelete] = useState(null); // blockId or null
	const [confirmImageDelete, setConfirmImageDelete] = useState(null); // imageId or null

	async function performRoomDelete() {
		if (!room.id) return;
		await deleteRoomAction(room.id);
		router.replace("/admin/rooms");
	}

	function handleHeroUploaded(record) {
		update("hero_file_id", record.id);
		setHero(record);
	}

	function handleHeroClear() {
		update("hero_file_id", null);
		setHero(null);
	}

	async function handleAddBlock({ type, section, category }) {
		if (!room.id) {
			setError("Save the room first before adding blocks.");
			return;
		}
		const payload = type === "prose"
			? { paragraphs: [""] }
			: { name: "", summary: "", items: [{ label: "", value: "" }] };
		const created = await upsertBlockAction({
			room_id: room.id,
			type,
			section,
			category: category ?? null,
			payload,
		});
		setBlocks((bs) => [...bs, created].sort((a, b) => a.sort_order - b.sort_order));
	}

	async function handleSaveBlock(block) {
		const updated = await upsertBlockAction({
			id: block.id,
			room_id: block.room_id,
			type: block.type,
			section: block.section,
			category: block.category,
			payload: block.payload,
		});
		setBlocks((bs) => bs.map((b) => (b.id === updated.id ? updated : b)));
	}

	async function performBlockDelete(blockId) {
		await deleteBlockAction(blockId);
		setBlocks((bs) => bs.filter((b) => b.id !== blockId));
	}

	async function handleMoveBlock(blockId, direction) {
		await moveBlockAction(blockId, direction);
		startTransition(() => router.refresh());
	}

	async function handleGalleryUploaded(record) {
		if (!room.id) {
			setError("Save the room first before uploading gallery images.");
			return;
		}
		const created = await addRoomImageAction({
			room_id: room.id,
			file_id: record.id,
			title: null,
		});
		setImages((xs) => [...xs, { ...created, url: record.public_url, mime_type: record.mime_type }]);
	}

	function setImageTitle(id, title) {
		setImages((xs) => xs.map((x) => (x.id === id ? { ...x, title } : x)));
	}

	async function handleSaveImageTitle(id) {
		const img = images.find((x) => x.id === id);
		if (!img) return;
		await updateRoomImageAction({ id, title: img.title ?? "" });
	}

	async function performImageDelete(id) {
		await deleteRoomImageAction(id);
		setImages((xs) => xs.filter((x) => x.id !== id));
	}

	async function handleMoveImage(id, direction) {
		await moveRoomImageAction(id, direction);
		const idx = images.findIndex((x) => x.id === id);
		const swap = direction === "up" ? idx - 1 : idx + 1;
		if (idx < 0 || swap < 0 || swap >= images.length) return;
		setImages((xs) => {
			const next = [...xs];
			[next[idx], next[swap]] = [next[swap], next[idx]];
			return next;
		});
	}

	async function handleSavePackage(pkg) {
		const saved = await saveFacilityPackageAction(pkg);
		setFacilityPackages((xs) => {
			const exists = xs.some((x) => x.id === saved.id);
			const merged = exists ? xs.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)) : [...xs, saved];
			return merged;
		});
		return saved;
	}

	async function handleAddPackage(categoryId) {
		const created = await saveFacilityPackageAction({
			room_id: room.id,
			category_id: categoryId,
			name: "New package",
			summary: "",
			items: [],
			price_cents: 0,
			vat_inclusive: false,
			is_active: true,
		});
		const cat = facilityCategories.find((c) => c.id === categoryId);
		setFacilityPackages((xs) => [
			...xs,
			{
				...created,
				category_key: cat?.key,
				category_label: cat?.label,
				category_icon: cat?.icon,
				category_sort_order: cat?.sort_order ?? 0,
			},
		]);
	}

	async function handleDeletePackage(id) {
		await deleteFacilityPackageAction(id);
		setFacilityPackages((xs) => xs.filter((x) => x.id !== id));
	}

	async function handleMovePackage(id, direction) {
		await moveFacilityPackageAction(id, direction);
		startTransition(() => router.refresh());
	}

	async function handleAddGroup(categoryId) {
		const created = await saveFacilityGroupAction({
			room_id: room.id,
			category_id: categoryId,
			label: "New choose-one set",
		});
		setFacilityGroups((xs) => [...xs, created]);
	}

	async function handleRenameGroup(id, label) {
		const saved = await saveFacilityGroupAction({
			id,
			room_id: room.id,
			category_id: facilityGroups.find((g) => g.id === id)?.category_id,
			label,
		});
		setFacilityGroups((xs) => xs.map((x) => (x.id === id ? { ...x, ...saved } : x)));
	}

	async function handleDeleteGroup(id) {
		await deleteFacilityGroupAction(id);
		setFacilityGroups((xs) => xs.filter((x) => x.id !== id));
		setFacilityPackages((xs) =>
			xs.map((p) => (p.group_id === id ? { ...p, group_id: null } : p)),
		);
	}

	async function handleToggleType(typeId, enabled) {
		setOfferedTypeIds((prev) => {
			const next = new Set(prev);
			if (enabled) next.add(typeId);
			else next.delete(typeId);
			return next;
		});
		setSavingTypes(true);
		const next = new Set(offeredTypeIds);
		if (enabled) next.add(typeId);
		else next.delete(typeId);
		try {
			await setRoomBookingTypesAction({
				room_id: room.id,
				booking_type_ids: [...next],
			});
		} finally {
			setSavingTypes(false);
		}
	}

	const status = !isNew && (
		<span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${
			room.is_published
				? "border-primary/30 bg-primary/10 text-primary"
				: "border-foreground/15 bg-muted text-muted-foreground"
		}`}>
			{room.is_published ? "Published" : "Draft"}
		</span>
	);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl">
			<div className="sticky top-0 -mx-6 lg:-mx-10 px-6 lg:px-10 pb-4 pt-6 lg:pt-10 -mt-6 lg:-mt-10 bg-background/85 backdrop-blur z-20 border-b border-foreground/10 mb-8">
				<div className="flex items-start justify-between gap-4 flex-wrap">
					<div className="min-w-0">
						<Link href="/admin/rooms" className="text-sm text-muted-foreground hover:text-foreground">
							← All rooms
						</Link>
						<div className="mt-2 flex items-center gap-3 flex-wrap">
							<h1 className="text-2xl font-semibold truncate">
								{isNew ? "New room" : room.name || "Untitled"}
							</h1>
							{status}
						</div>
					</div>
					<div className="flex gap-2">
						{!isNew && (
							<Button variant="outline" onClick={() => setConfirmRoomDeleteOpen(true)} disabled={saving}>
								Delete
							</Button>
						)}
						<Button onClick={handleSave} disabled={saving || !room.name || !room.slug}>
							{saving ? "Saving…" : "Save"}
						</Button>
					</div>
				</div>
			</div>

			{error && (
				<div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
					{error}
				</div>
			)}

			<Tabs value={tab} onValueChange={setTab}>
				<TabsList className="mb-6 flex-wrap">
					<TabsTrigger value="details">Details</TabsTrigger>
					<TabsTrigger value="pricing" disabled={isNew}>Pricing</TabsTrigger>
					<TabsTrigger value="facilities" disabled={isNew}>Facility Packages</TabsTrigger>
					<TabsTrigger value="content" disabled={isNew}>Content</TabsTrigger>
					<TabsTrigger value="gallery" disabled={isNew}>Gallery</TabsTrigger>
				</TabsList>

				<TabsContent value="details" className="space-y-8">
					<section className="rounded-lg border bg-card p-6 space-y-5">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Basics</h2>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input id="name" value={room.name} onChange={(e) => update("name", e.target.value)} onBlur={autofillSlug} />
							</div>
							<div className="space-y-2">
								<Label htmlFor="slug">Slug</Label>
								<Input id="slug" value={room.slug} onChange={(e) => update("slug", e.target.value)} placeholder="concert-hall" />
							</div>
							<div className="space-y-2 sm:col-span-2">
								<Label htmlFor="tagline">Tagline</Label>
								<Input id="tagline" value={room.tagline ?? ""} onChange={(e) => update("tagline", e.target.value)} />
							</div>
							<div className="space-y-2 sm:col-span-2">
								<Label htmlFor="short_description">Short description</Label>
								<Textarea id="short_description" rows={3} value={room.short_description ?? ""} onChange={(e) => update("short_description", e.target.value)} />
							</div>
							<div className="space-y-2 sm:col-span-2">
								<Label htmlFor="av_highlight">AV highlight (one-liner shown on cards)</Label>
								<Input id="av_highlight" value={room.av_highlight ?? ""} onChange={(e) => update("av_highlight", e.target.value)} />
							</div>
							<div className="space-y-2 sm:col-span-2">
								<Label htmlFor="accent_hue">Accent hue (Tailwind gradient stops)</Label>
								<Input id="accent_hue" value={room.accent_hue ?? ""} onChange={(e) => update("accent_hue", e.target.value)} placeholder="from-cyan-500/15 via-cyan-700/10 to-transparent" />
							</div>
							<div className="space-y-2">
								<Label htmlFor="sort_order">Sort order</Label>
								<Input id="sort_order" type="number" value={room.sort_order ?? 0} onChange={(e) => update("sort_order", e.target.value)} />
							</div>
							<div className="flex items-end gap-2 pb-1">
								<Checkbox
									id="is_published"
									checked={!!room.is_published}
									onCheckedChange={(v) => update("is_published", !!v)}
								/>
								<Label htmlFor="is_published">Published</Label>
							</div>
						</div>
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-5">
						<div className="flex items-baseline justify-between gap-4">
							<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Booking types offered</h2>
							{savingTypes && <span className="text-xs text-muted-foreground">Saving…</span>}
						</div>
						<p className="text-xs text-muted-foreground">
							Tick the booking types this room offers. The booking widget will only ask customers about ticked types.
						</p>
						{isNew ? (
							<p className="text-sm text-muted-foreground">Save the room first.</p>
						) : (
							<div className="grid gap-2 sm:grid-cols-2">
								{bookingTypes.map((t) => (
									<label
										key={t.id}
										className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer"
									>
										<Checkbox
											checked={offeredTypeIds.has(t.id)}
											onCheckedChange={(v) => handleToggleType(t.id, !!v)}
										/>
										<div className="min-w-0 flex-1">
											<div className="text-sm font-medium">{t.label}</div>
											{t.description && (
												<div className="text-xs text-muted-foreground truncate">{t.description}</div>
											)}
										</div>
									</label>
								))}
							</div>
						)}
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-5">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Availability</h2>
						<div className="grid gap-4 sm:grid-cols-[200px_1fr] items-start">
							<div className="space-y-2">
								<Label htmlFor="buffer_minutes">Buffer between bookings (minutes)</Label>
								<Input
									id="buffer_minutes"
									type="number"
									min="0"
									max="720"
									step="15"
									value={String(room.buffer_minutes ?? 60)}
									onChange={(e) =>
										update("buffer_minutes", Math.max(0, Math.round(Number(e.target.value || 0))))
									}
								/>
							</div>
							<p className="text-xs text-muted-foreground sm:pt-9">
								Minimum gap enforced between two bookings on this room. Used to give staff time to reset between events.
							</p>
						</div>
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-5">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Ticketed events</h2>
						<p className="text-xs text-muted-foreground">
							If enabled, customers booking this room can add ticketing during the booking flow. The setup fee below is charged as a one-off at booking time.
						</p>
						<div className="space-y-4">
							<div className="flex items-center gap-3">
								<Checkbox
									id="allow_ticketed_events"
									checked={!!room.allow_ticketed_events}
									onCheckedChange={(v) => update("allow_ticketed_events", !!v)}
								/>
								<Label htmlFor="allow_ticketed_events">Allow ticketed events in this room</Label>
							</div>
							<div className="grid gap-4 sm:grid-cols-[200px_1fr] items-start">
								<div className="space-y-2">
									<Label htmlFor="ticketing_setup_fee_pct">Setup fee (% of event-day hire)</Label>
									<Input
										id="ticketing_setup_fee_pct"
										type="number"
										min="0"
										max="100"
										step="0.5"
										value={(room.ticketing_setup_fee_pct_x100 / 100).toString()}
										onChange={(e) =>
											update(
												"ticketing_setup_fee_pct_x100",
												Math.round(Number(e.target.value || 0) * 100),
											)
										}
										disabled={!room.allow_ticketed_events}
									/>
								</div>
								<p className="text-xs text-muted-foreground sm:pt-9">
									Discounts don&apos;t apply to this fee. Per-ticket fees are configured globally in{" "}
									<Link href="/admin/settings/ticketing" className="underline hover:text-foreground">
										Settings → Ticketing
									</Link>
									.
								</p>
							</div>
						</div>
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-5">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Capacities</h2>
						<p className="text-xs text-muted-foreground">
							Tick the layouts this room offers and set a capacity for each. Customers will only be able to book layouts that are ticked here.
						</p>
						<div className="grid gap-3 sm:grid-cols-2">
							{capacities.map((c) => {
								const iconDef = c.icon ? byPrefixAndName.fas[c.icon] : null;
								return (
									<div
										key={c.layout_id}
										className={`flex items-center gap-3 rounded-md border px-3 py-2 transition ${
											c.enabled ? "bg-background" : "bg-muted/30 opacity-70"
										}`}
									>
										<Checkbox
											id={`cap-enabled-${c.key}`}
											checked={c.enabled}
											onCheckedChange={(v) => setCapacityEnabled(c.layout_id, !!v)}
										/>
										<Label
											htmlFor={`cap-enabled-${c.key}`}
											className="flex-1 flex items-center gap-2 cursor-pointer"
										>
											{iconDef && (
												<FontAwesomeIcon
													icon={iconDef}
													className="h-4 w-4 text-muted-foreground"
												/>
											)}
											<span>{c.label}</span>
										</Label>
										<Input
											type="number"
											min="0"
											placeholder="—"
											value={c.value}
											onChange={(e) => setCapacityValue(c.layout_id, e.target.value)}
											disabled={!c.enabled}
											className="w-24"
											aria-label={`${c.label} capacity`}
										/>
									</div>
								);
							})}
						</div>
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-5">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Hero image</h2>
						{hero?.public_url ? (
							<div className="space-y-3">
								<div className="relative aspect-video w-full max-w-xl overflow-hidden rounded-md border">
									<Image src={hero.public_url} alt={room.name || "Hero"} fill sizes="640px" className="object-cover" />
								</div>
								<div className="flex gap-2">
									<FileUpload fileType="room-hero" accept="image/*" label="Replace" onUploaded={handleHeroUploaded} />
									<Button variant="outline" onClick={handleHeroClear}>
										Clear
									</Button>
								</div>
							</div>
						) : (
							<div>
								<FileUpload fileType="room-hero" accept="image/*" label="Upload hero image" onUploaded={handleHeroUploaded} />
								<p className="text-xs text-muted-foreground mt-2">PNG / JPG. Recommended ~16:9.</p>
							</div>
						)}
					</section>
				</TabsContent>

				<TabsContent value="pricing" className="space-y-8">
					<section className="rounded-lg border bg-card p-6 space-y-6">
						<div>
							<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Pricing</h2>
							<p className="text-xs text-muted-foreground mt-1">
								One section per booking type this room offers. Toggle types in the Details tab.
							</p>
						</div>
						<RoomPricingEditor
							roomId={room.id}
							offeredTypes={bookingTypes.filter((t) => offeredTypeIds.has(t.id))}
							vatRates={vatRates}
							initialRules={pricingRules}
						/>
					</section>
				</TabsContent>

				<TabsContent value="facilities" className="space-y-8">
					{facilityPackagesByCategory.map(({ category, packages }) => {
						const catGroups = facilityGroups.filter((g) => g.category_id === category.id);
						return (
							<section key={category.id} className="rounded-lg border bg-card p-6 space-y-5">
								<div className="flex items-center justify-between gap-4">
									<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
										{category.label}
									</h2>
									<div className="flex items-center gap-2">
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => handleAddGroup(category.id)}
										>
											+ Set
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => handleAddPackage(category.id)}
										>
											+ Package
										</Button>
									</div>
								</div>

								{catGroups.length > 0 && (
									<div className="space-y-2">
										<p className="text-xs text-muted-foreground">
											Choose-one sets — group packages so customers can pick only one.
										</p>
										<div className="space-y-2">
											{catGroups.map((g) => (
												<FacilityGroupRow
													key={g.id}
													group={g}
													memberCount={facilityPackages.filter((p) => p.group_id === g.id).length}
													onRename={(label) => handleRenameGroup(g.id, label)}
													onDelete={() => handleDeleteGroup(g.id)}
												/>
											))}
										</div>
									</div>
								)}

								{packages.length === 0 && (
									<p className="text-sm text-muted-foreground">No packages yet.</p>
								)}
								<div className="space-y-4">
									{packages.map((pkg, i) => (
										<FacilityPackageEditor
											key={pkg.id}
											pkg={pkg}
											vatRates={vatRates}
											groups={catGroups}
											isFirst={i === 0}
											isLast={i === packages.length - 1}
											busy={pending}
											onSave={(next) => handleSavePackage(next)}
											onDelete={() => handleDeletePackage(pkg.id)}
											onMove={(dir) => handleMovePackage(pkg.id, dir)}
										/>
									))}
								</div>
							</section>
						);
					})}
				</TabsContent>

				<TabsContent value="content" className="space-y-8">
					<section className="rounded-lg border bg-card p-6 space-y-5">
						<div className="flex items-center justify-between gap-4">
							<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">About</h2>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => handleAddBlock({ type: "prose", section: "about", category: null })}
							>
								+ Paragraphs
							</Button>
						</div>
						{aboutBlocks.length === 0 && (
							<p className="text-sm text-muted-foreground">
								No prose blocks yet. The short description above already shows on the public site.
							</p>
						)}
						<div className="space-y-4">
							{aboutBlocks.map((b, i) => (
								<BlockEditor
									key={b.id}
									block={b}
									isFirst={i === 0}
									isLast={i === aboutBlocks.length - 1}
									onChange={(payload) => setBlocks((bs) => bs.map((x) => (x.id === b.id ? { ...x, payload } : x)))}
									onSave={() => handleSaveBlock(blocks.find((x) => x.id === b.id))}
									onDelete={() => setConfirmBlockDelete(b.id)}
									onMove={(dir) => handleMoveBlock(b.id, dir)}
									busy={pending}
								/>
							))}
						</div>
					</section>
				</TabsContent>

				<TabsContent value="gallery" className="space-y-8">
					<section className="rounded-lg border bg-card p-6 space-y-5">
						<div className="flex items-center justify-between gap-4">
							<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Gallery</h2>
							<FileUpload
								fileType="room-gallery"
								accept="image/*"
								label="Upload image"
								onUploaded={handleGalleryUploaded}
							/>
						</div>
						{images.length === 0 && (
							<p className="text-sm text-muted-foreground">No gallery images yet.</p>
						)}
						{images.length > 0 && (
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{images.map((img, i) => (
									<div key={img.id} className="rounded-md border bg-background overflow-hidden">
										<div className="relative aspect-video bg-muted/30">
											{img.url && (
												<Image
													src={img.url}
													alt={img.title || room.name || "Gallery image"}
													fill
													sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
													className="object-cover"
												/>
											)}
										</div>
										<div className="p-3 space-y-2">
											<Input
												placeholder="Title (also used as alt text)"
												value={img.title ?? ""}
												onChange={(e) => setImageTitle(img.id, e.target.value)}
												onBlur={() => handleSaveImageTitle(img.id)}
											/>
											<div className="flex items-center justify-between gap-1">
												<div className="flex items-center gap-1">
													<Button
														type="button"
														variant="ghost"
														size="sm"
														disabled={i === 0}
														onClick={() => handleMoveImage(img.id, "up")}
													>
														↑
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="sm"
														disabled={i === images.length - 1}
														onClick={() => handleMoveImage(img.id, "down")}
													>
														↓
													</Button>
												</div>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => setConfirmImageDelete(img.id)}
												>
													Delete
												</Button>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</section>
				</TabsContent>
			</Tabs>

			<ConfirmDialog
				open={confirmRoomDeleteOpen}
				onOpenChange={setConfirmRoomDeleteOpen}
				title="Delete this room?"
				description={`"${room.name || "Untitled room"}" will be removed. This is reversible (soft delete).`}
				confirmLabel="Delete room"
				destructive
				onConfirm={performRoomDelete}
			/>
			<ConfirmDialog
				open={confirmBlockDelete !== null}
				onOpenChange={(v) => !v && setConfirmBlockDelete(null)}
				title="Delete this block?"
				description="The block will be removed from this room."
				confirmLabel="Delete block"
				destructive
				onConfirm={async () => {
					const id = confirmBlockDelete;
					if (!id) return;
					await performBlockDelete(id);
					setConfirmBlockDelete(null);
				}}
			/>
			<ConfirmDialog
				open={confirmImageDelete !== null}
				onOpenChange={(v) => !v && setConfirmImageDelete(null)}
				title="Delete this image?"
				description="The image will be removed from this room's gallery."
				confirmLabel="Delete image"
				destructive
				onConfirm={async () => {
					const id = confirmImageDelete;
					if (!id) return;
					await performImageDelete(id);
					setConfirmImageDelete(null);
				}}
			/>
		</div>
	);
}

function BlockEditor({ block, isFirst, isLast, onChange, onSave, onDelete, onMove, busy }) {
	const [savingMsg, setSavingMsg] = useState(null);

	async function save() {
		setSavingMsg("Saving…");
		try {
			await onSave();
			setSavingMsg("Saved");
			setTimeout(() => setSavingMsg(null), 1200);
		} catch (e) {
			setSavingMsg(e?.message || "Failed");
		}
	}

	return (
		<div className="rounded-md border bg-background p-5 space-y-4">
			<div className="flex items-center justify-between gap-4">
				<span className="text-xs uppercase tracking-[0.2em] text-primary">{block.type.replace(/_/g, " ")}</span>
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="sm" disabled={isFirst || busy} onClick={() => onMove("up")}>↑</Button>
					<Button variant="ghost" size="sm" disabled={isLast || busy} onClick={() => onMove("down")}>↓</Button>
					<Button variant="ghost" size="sm" onClick={onDelete}>Delete</Button>
					<Button size="sm" onClick={save}>Save block</Button>
				</div>
			</div>
			{block.type === "prose" && <ProseFields payload={block.payload} onChange={onChange} />}
			{block.type === "av_package" && <AvPackageFields payload={block.payload} onChange={onChange} />}
			{savingMsg && <p className="text-xs text-muted-foreground">{savingMsg}</p>}
		</div>
	);
}

function ProseFields({ payload, onChange }) {
	const paragraphs = Array.isArray(payload?.paragraphs) ? payload.paragraphs : [""];
	function setParas(next) {
		onChange({ ...payload, paragraphs: next });
	}
	return (
		<div className="space-y-3">
			{paragraphs.map((p, i) => (
				<div key={i} className="flex items-start gap-2">
					<Textarea
						rows={3}
						value={p}
						onChange={(e) => {
							const next = [...paragraphs];
							next[i] = e.target.value;
							setParas(next);
						}}
					/>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setParas(paragraphs.filter((_, j) => j !== i))}
						disabled={paragraphs.length <= 1}
					>
						Remove
					</Button>
				</div>
			))}
			<Button variant="outline" size="sm" onClick={() => setParas([...paragraphs, ""])}>
				Add paragraph
			</Button>
		</div>
	);
}

const NO_GROUP = "__none__";

function FacilityGroupRow({ group, memberCount, onRename, onDelete }) {
	const [label, setLabel] = useState(group.label ?? "");
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [busy, setBusy] = useState(false);

	async function commit() {
		if (!label.trim() || label === group.label) return;
		setBusy(true);
		try {
			await onRename(label.trim());
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex items-center gap-3 rounded-md border bg-background p-3">
			<Input
				value={label}
				onChange={(e) => setLabel(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						e.currentTarget.blur();
					}
				}}
				disabled={busy}
				className="flex-1"
			/>
			<span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
				{memberCount} {memberCount === 1 ? "package" : "packages"}
			</span>
			<Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
				Delete
			</Button>
			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title="Delete this set?"
				description={
					memberCount > 0
						? `${memberCount} ${memberCount === 1 ? "package" : "packages"} will become independent (free to combine).`
						: "This set will be removed."
				}
				confirmLabel="Delete set"
				destructive
				onConfirm={onDelete}
			/>
		</div>
	);
}

function FacilityPackageEditor({ pkg, vatRates, groups = [], isFirst, isLast, busy, onSave, onDelete, onMove }) {
	const [draft, setDraft] = useState(() => ({
		id: pkg.id,
		room_id: pkg.room_id,
		category_id: pkg.category_id,
		group_id: pkg.group_id ?? null,
		name: pkg.name ?? "",
		summary: pkg.summary ?? "",
		items: Array.isArray(pkg.items) ? pkg.items : [],
		price_cents: pkg.price_cents ?? 0,
		vat_rate_id: pkg.vat_rate_id ?? null,
		vat_inclusive: !!pkg.vat_inclusive,
		quantifiable: !!pkg.quantifiable,
		is_active: pkg.is_active !== false,
	}));
	const [savingMsg, setSavingMsg] = useState(null);
	const [confirmOpen, setConfirmOpen] = useState(false);

	function update(field, value) {
		setDraft((d) => ({ ...d, [field]: value }));
	}
	function setItems(next) {
		setDraft((d) => ({ ...d, items: next }));
	}

	async function save() {
		setSavingMsg("Saving…");
		try {
			await onSave(draft);
			setSavingMsg("Saved");
			setTimeout(() => setSavingMsg(null), 1200);
		} catch (e) {
			setSavingMsg(e?.message || "Failed");
		}
	}

	const items = draft.items;

	return (
		<div className={`rounded-md border bg-background p-5 space-y-4 ${draft.is_active ? "" : "opacity-70"}`}>
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<Checkbox
						checked={draft.is_active}
						onCheckedChange={(v) => update("is_active", !!v)}
						aria-label="Active"
					/>
					<span className="text-xs uppercase tracking-[0.2em] text-primary">
						{draft.is_active ? "Active" : "Hidden"}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="sm" disabled={isFirst || busy} onClick={() => onMove("up")}>↑</Button>
					<Button variant="ghost" size="sm" disabled={isLast || busy} onClick={() => onMove("down")}>↓</Button>
					<Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>Delete</Button>
					<Button size="sm" onClick={save}>Save package</Button>
					<ConfirmDialog
						open={confirmOpen}
						onOpenChange={setConfirmOpen}
						title="Delete this package?"
						description={`"${draft.name || pkg.name || "Untitled package"}" will be removed. You can recreate it later if needed.`}
						confirmLabel="Delete package"
						destructive
						onConfirm={onDelete}
					/>
				</div>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label>Package name</Label>
					<Input value={draft.name} onChange={(e) => update("name", e.target.value)} />
				</div>
				<div className="space-y-2">
					<Label>Summary</Label>
					<Input value={draft.summary} onChange={(e) => update("summary", e.target.value)} />
				</div>
				<div className="space-y-2">
					<Label>Price (£)</Label>
					<Input
						type="number"
						min="0"
						step="0.01"
						value={(draft.price_cents / 100).toString()}
						onChange={(e) => update("price_cents", Math.round(Number(e.target.value || 0) * 100))}
					/>
				</div>
				<div className="space-y-2">
					<Label>VAT</Label>
					<Select
						value={draft.vat_rate_id ?? NO_VAT}
						onValueChange={(v) => update("vat_rate_id", v === NO_VAT ? null : v)}
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
				<div className="flex items-end gap-2 pb-1 sm:col-span-2">
					<Checkbox
						id={`vat-inc-${pkg.id}`}
						checked={!!draft.vat_inclusive}
						onCheckedChange={(v) => update("vat_inclusive", !!v)}
					/>
					<Label htmlFor={`vat-inc-${pkg.id}`}>Price includes VAT</Label>
				</div>
				<div className="space-y-2 sm:col-span-2">
					<Label>Choose-one set (optional)</Label>
					<Select
						value={draft.group_id ?? NO_GROUP}
						onValueChange={(v) => update("group_id", v === NO_GROUP ? null : v)}
					>
						<SelectTrigger>
							<SelectValue placeholder="Not in a set" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NO_GROUP}>Not in a set</SelectItem>
							{groups.map((g) => (
								<SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground">
						When a set is picked, customers can only choose one of the packages in that set.
					</p>
				</div>
				<div className="flex items-start gap-2 sm:col-span-2">
					<Checkbox
						id={`qty-${pkg.id}`}
						checked={!!draft.quantifiable}
						onCheckedChange={(v) => update("quantifiable", !!v)}
						className="mt-0.5"
					/>
					<div>
						<Label htmlFor={`qty-${pkg.id}`}>Customer can choose a quantity</Label>
						<p className="text-xs text-muted-foreground mt-0.5">
							Tick this for things you sell per delegate (e.g. lunches). Leave unticked for unique
							packages where you can only have one (e.g. an AV package).
						</p>
					</div>
				</div>
			</div>

			<div className="space-y-2">
				<Label>What&apos;s included</Label>
				{items.map((it, i) => (
					<div key={i} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
						<Input
							placeholder="Label (e.g. PA)"
							value={it.label ?? ""}
							onChange={(e) => {
								const next = [...items];
								next[i] = { ...next[i], label: e.target.value };
								setItems(next);
							}}
						/>
						<Input
							placeholder="Value"
							value={it.value ?? ""}
							onChange={(e) => {
								const next = [...items];
								next[i] = { ...next[i], value: e.target.value };
								setItems(next);
							}}
						/>
						<Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>
							Remove
						</Button>
					</div>
				))}
				<Button variant="outline" size="sm" onClick={() => setItems([...items, { label: "", value: "" }])}>
					Add item
				</Button>
			</div>

			{savingMsg && <p className="text-xs text-muted-foreground">{savingMsg}</p>}
		</div>
	);
}

function AvPackageFields({ payload, onChange }) {
	const items = Array.isArray(payload?.items) ? payload.items : [];
	function set(field, value) {
		onChange({ ...payload, [field]: value });
	}
	function setItems(next) {
		onChange({ ...payload, items: next });
	}
	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label>Package name</Label>
					<Input value={payload?.name ?? ""} onChange={(e) => set("name", e.target.value)} />
				</div>
				<div className="space-y-2">
					<Label>Summary</Label>
					<Input value={payload?.summary ?? ""} onChange={(e) => set("summary", e.target.value)} />
				</div>
			</div>
			<div className="space-y-2">
				<Label>Items</Label>
				{items.map((it, i) => (
					<div key={i} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
						<Input
							placeholder="Label (e.g. PA)"
							value={it.label ?? ""}
							onChange={(e) => {
								const next = [...items];
								next[i] = { ...next[i], label: e.target.value };
								setItems(next);
							}}
						/>
						<Input
							placeholder="Value"
							value={it.value ?? ""}
							onChange={(e) => {
								const next = [...items];
								next[i] = { ...next[i], value: e.target.value };
								setItems(next);
							}}
						/>
						<Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>
							Remove
						</Button>
					</div>
				))}
				<Button variant="outline" size="sm" onClick={() => setItems([...items, { label: "", value: "" }])}>
					Add item
				</Button>
			</div>
		</div>
	);
}
