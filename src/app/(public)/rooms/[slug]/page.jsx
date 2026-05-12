import { notFound } from "next/navigation";
import Image from "next/image";
import { and, asc, eq, isNull } from "drizzle-orm";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { byPrefixAndName } from "@awesome.me/kit-71c392801a/icons";
import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { CtaButton } from "@/site/ui/cta-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs";
import { ProseBlock } from "@/site/ui/blocks/prose-block";
import { FacilityPackageBlock } from "@/site/ui/blocks/facility-package-block";
import Link from "next/link";
import {
	getPublishedRoomBySlug,
	listRoomBlocks,
	listRoomImages,
	listFacilityPackages,
	listRoomBookingTypes,
} from "@/db/queries/rooms";
import { listPublishedEventsForRoom } from "@/db/queries/events";
import { requireCurrentVenue } from "@/db/queries/venue";
import { db } from "@/db/index.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";
import { discount } from "@/db/schema/entities/discount.js";
import { getTicketingSettings } from "@/db/queries/settings";
import BookingDialog from "@/site/booking/booking-dialog";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
	const { slug } = await params;
	const venue = await requireCurrentVenue();
	const room = await getPublishedRoomBySlug(venue.id, slug);
	if (!room) return {};
	return {
		title: `${room.name} — The Assembly Rooms`,
		description: room.tagline ?? room.short_description ?? "",
	};
}

export default async function RoomPage({ params }) {
	const { slug } = await params;
	const venue = await requireCurrentVenue();
	const room = await getPublishedRoomBySlug(venue.id, slug);
	if (!room) notFound();

	const ticketingSettings = await getTicketingSettings(room.venue_id);
	const [blocks, gallery, facilityPackages, offeredTypes, bookingTypes, discounts, upcomingEvents, pastEvents] = await Promise.all([
		listRoomBlocks(room.id),
		listRoomImages(room.id),
		listFacilityPackages(room.id, { activeOnly: true }),
		listRoomBookingTypes(room.id),
		db
			.select()
			.from(booking_type)
			.where(isNull(booking_type.deletedAt))
			.orderBy(asc(booking_type.sort_order), asc(booking_type.label)),
		db
			.select()
			.from(discount)
			.where(
				and(
					eq(discount.venue_id, room.venue_id),
					eq(discount.is_active, true),
					isNull(discount.deletedAt),
				),
			)
			.orderBy(asc(discount.sort_order), asc(discount.label)),
		listPublishedEventsForRoom(room.venue_id, room.id, { which: "upcoming", limit: 6 }),
		listPublishedEventsForRoom(room.venue_id, room.id, { which: "past", limit: 8 }),
	]);

	const roomForBooking = {
		...room,
		facility_packages: facilityPackages,
		offered_booking_type_ids: offeredTypes.map((t) => t.booking_type_id),
	};

	const aboutBlocks = blocks.filter((b) => (b.section ?? "about") === "about" && b.type === "prose");

	const facilityByCategory = new Map();
	const categoryMeta = new Map();
	for (const p of facilityPackages) {
		const cat = p.category_id;
		if (!facilityByCategory.has(cat)) {
			facilityByCategory.set(cat, []);
			categoryMeta.set(cat, { key: p.category_key, label: p.category_label, sort_order: p.category_sort_order ?? 0 });
		}
		facilityByCategory.get(cat).push(p);
	}

	const facilityCategoryIds = [...facilityByCategory.keys()].sort(
		(a, b) => (categoryMeta.get(a)?.sort_order ?? 0) - (categoryMeta.get(b)?.sort_order ?? 0),
	);
	const showFacilities = facilityCategoryIds.length > 0;
	const onlyOneCategory = facilityCategoryIds.length === 1;
	const facilitiesTabLabel = onlyOneCategory
		? categoryMeta.get(facilityCategoryIds[0])?.label ?? "Facilities"
		: "Facilities";

	const showGallery = gallery.length > 0;

	const tabs = [
		{ value: "about", label: `About ${room.name}` },
	];
	if (showFacilities) tabs.push({ value: "facilities", label: facilitiesTabLabel });
	if (showGallery) tabs.push({ value: "gallery", label: "Gallery" });

	return (
		<>
			<Hero
				height="medium"
				kicker="Room"
				title={room.name}
				subtitle={room.tagline ?? undefined}
				hue={room.accent_hue ?? undefined}
				backgroundImage={room.hero_url ?? undefined}
				backgroundAlt={room.name}
			/>
			<Section>
				<div className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
					<div>
						<Tabs defaultValue="about" className="w-full">
							<TabsList className="bg-card/60 border border-foreground/10 p-1 h-auto flex-wrap gap-1">
								{tabs.map((t) => (
									<TabsTrigger
										key={t.value}
										value={t.value}
										className="data-[state=active]:bg-background"
									>
										{t.label}
									</TabsTrigger>
								))}
							</TabsList>

							<TabsContent value="about" className="mt-8">
								<div className="space-y-8">
									{room.short_description && (
										<p className="text-lg leading-relaxed text-foreground/85 max-w-3xl">
											{room.short_description}
										</p>
									)}
									{aboutBlocks.map((b) => (
										<ProseBlock key={b.id} payload={b.payload} />
									))}
								</div>
							</TabsContent>

							{showFacilities && (
								<TabsContent value="facilities" className="mt-8">
									<div className="space-y-10">
										{facilityCategoryIds.map((catId) => {
											const items = facilityByCategory.get(catId);
											const label = categoryMeta.get(catId)?.label ?? "Other";
											return (
												<div key={catId} className="space-y-5">
													{!onlyOneCategory && (
														<h3 className="text-xs uppercase tracking-[0.22em] text-primary">
															{label}
														</h3>
													)}
													<div className="space-y-5">
														{items.map((p) => (
															<FacilityPackageBlock key={p.id} pkg={p} />
														))}
													</div>
												</div>
											);
										})}
									</div>
								</TabsContent>
							)}

							{showGallery && (
								<TabsContent value="gallery" className="mt-8">
									<div className="grid gap-4 sm:grid-cols-2">
										{gallery.map((img) => (
											<figure
												key={img.id}
												className="overflow-hidden rounded-xl border border-foreground/10 bg-card"
											>
												<div className="relative aspect-video">
													<Image
														src={img.url}
														alt={img.title || room.name}
														fill
														sizes="(min-width: 1024px) 50vw, 100vw"
														className="object-cover"
													/>
												</div>
												{img.title && (
													<figcaption className="px-4 py-3 text-sm text-foreground/85">
														{img.title}
													</figcaption>
												)}
											</figure>
										))}
									</div>
								</TabsContent>
							)}
						</Tabs>
					</div>
					<aside className="rounded-xl border border-foreground/10 bg-card p-6 h-fit lg:sticky lg:top-28 space-y-6">
						<BookingDialog
							room={roomForBooking}
							bookingTypes={bookingTypes}
							discounts={discounts}
							ticketingSettings={ticketingSettings}
						/>
						<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">
							At a glance
						</h2>
						{room.capacities?.length > 0 && (
							<dl className="mt-5 space-y-3">
								{room.capacities.map((c) => {
									const iconDef = c.icon ? byPrefixAndName.fas[c.icon] : null;
									return (
										<div
											key={c.layout_id}
											className="flex items-center justify-between gap-4 border-t border-foreground/10 pt-3 first:border-t-0 first:pt-0"
										>
											<dt className="flex items-center gap-2.5 text-sm text-foreground/80">
												{iconDef && (
													<FontAwesomeIcon
														icon={iconDef}
														className="h-4 w-4 text-muted-foreground"
													/>
												)}
												<span>{c.label}</span>
											</dt>
											<dd className="font-display text-lg leading-tight">{c.value}</dd>
										</div>
									);
								})}
							</dl>
						)}
						{room.av_highlight && (
							<div className="mt-5 border-t border-foreground/10 pt-4">
								<p className="text-xs text-muted-foreground">AV</p>
								<p className="mt-1 text-sm text-foreground/85 leading-relaxed">
									{room.av_highlight}
								</p>
							</div>
						)}
					</aside>
				</div>
			</Section>

			{upcomingEvents.length > 0 && (
				<Section kicker="What's on here" title={`Coming up in ${room.name}`}>
					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
						{upcomingEvents.map((ev) => (
							<UpcomingEventCard key={ev.id} ev={ev} />
						))}
					</div>
				</Section>
			)}

			{pastEvents.length > 0 && (
				<Section kicker="Memory" title="What's already happened here">
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{pastEvents.map((ev) => (
							<PastEventTile key={ev.id} ev={ev} />
						))}
					</div>
				</Section>
			)}
		</>
	);
}

const upcomingDateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	timeZone: "Europe/London",
});
const upcomingTimeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

function UpcomingEventCard({ ev }) {
	const date = ev.starts_at ? new Date(ev.starts_at) : null;
	const externalHref = ev.external_url || null;
	const href = externalHref || `/events/${ev.slug}`;
	return (
		<Link
			href={href}
			{...(externalHref ? { target: "_blank", rel: "noreferrer" } : {})}
			className="group relative flex flex-col overflow-hidden rounded-xl border border-foreground/10 bg-card transition hover:border-primary/40"
		>
			<div className="relative h-44 overflow-hidden bg-muted/40">
				{ev.banner_url && (
					<Image
						src={ev.banner_url}
						alt={ev.title}
						fill
						sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
						className="object-cover grayscale-40 group-hover:grayscale-0 transition duration-500"
					/>
				)}
				<div className="absolute inset-0 bg-linear-to-t from-card via-card/40 to-transparent" />
				{date && (
					<div className="absolute left-4 top-4 flex items-baseline gap-2 text-foreground">
						<span className="font-display text-2xl tracking-tight">
							{upcomingDateFmt.format(date)}
						</span>
						<span className="text-[10px] uppercase tracking-[0.22em] text-foreground/70">
							{upcomingTimeFmt.format(date)}
						</span>
					</div>
				)}
			</div>
			<div className="flex flex-1 flex-col gap-2 p-5">
				<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
					<span className={ev.is_ticketed ? "text-primary" : ""}>
						{ev.is_ticketed ? "Ticketed" : "Free entry"}
					</span>
				</div>
				<h3 className="font-display text-lg tracking-tight">{ev.title}</h3>
				{ev.summary && (
					<p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
						{ev.summary}
					</p>
				)}
			</div>
		</Link>
	);
}

function PastEventTile({ ev }) {
	const imageUrl = ev.gallery_photo_url || ev.banner_url;
	const date = ev.starts_at ? new Date(ev.starts_at) : null;
	const dateLabel = date
		? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(date)
		: null;
	return (
		<figure className="relative overflow-hidden rounded-xl border border-foreground/10 bg-card">
			<div className="relative aspect-square bg-muted/40">
				{imageUrl && (
					<Image
						src={imageUrl}
						alt={ev.title}
						fill
						sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
						className="object-cover"
					/>
				)}
				<div className="absolute inset-0 bg-linear-to-t from-card to-transparent" />
			</div>
			<figcaption className="absolute inset-x-0 bottom-0 px-4 py-3">
				{dateLabel && (
					<div className="text-[10px] uppercase tracking-[0.22em] text-foreground/70">
						{dateLabel}
					</div>
				)}
				<div className="font-display text-sm tracking-tight mt-0.5">{ev.title}</div>
			</figcaption>
		</figure>
	);
}
