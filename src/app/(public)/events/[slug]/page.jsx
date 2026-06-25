import { notFound } from "next/navigation";
import Image from "next/image";
import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { Container } from "@/site/ui/container";
import { CtaButton } from "@/site/ui/cta-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs";
import {
	getEventBySlug,
	listEventFaqs,
	listTicketTypes,
	listTicketAddons,
	listTicketTypeAddonLinks,
	listTicketBundles,
	listTicketDiscounts,
	listEventRoomsResolved,
} from "@/db/queries/events";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getServerSession } from "@/utils/auth/server-guard";
import { getUserAccess } from "@/utils/auth/rbac";
import TicketSelector from "@/site/events/ticket-selector";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "Europe/London",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

export async function generateMetadata({ params }) {
	const { slug } = await params;
	const venue = await requireCurrentVenue();
	const ev = await getEventBySlug(venue.id, slug);
	if (!ev) return {};
	return {
		title: `${ev.title} - The Assembly Rooms`,
		description: ev.summary ?? "",
	};
}

export default async function EventPage({ params, searchParams }) {
	const { slug } = await params;
	const sp = await searchParams;
	const venue = await requireCurrentVenue();
	const ev = await getEventBySlug(venue.id, slug);
	if (!ev) notFound();

	// `visibility` only controls whether the event appears in public
	// listings (home page "What's on", /whats-on, room pages). Anyone
	// with the slug can view the event page directly — that's the whole
	// point of giving private events a shareable URL. Drafts and other
	// non-published statuses still 404 unless an admin/staff hits it
	// with `?preview=1`.
	const preview = sp?.preview === "1";
	if (ev.status !== "published") {
		const session = await getServerSession();
		const access = session?.user ? await getUserAccess(session.user.id) : null;
		const canPreview =
			preview && access && (access.roles.includes("admin") || access.roles.includes("staff"));
		if (!canPreview) notFound();
	}

	const [faqs, ticketTypes, addons, typeAddonLinks, bundles, discounts, rooms] = await Promise.all([
		listEventFaqs(ev.id),
		listTicketTypes(ev.id, { activeOnly: true }),
		listTicketAddons(ev.id, { activeOnly: true }),
		listTicketTypeAddonLinks(ev.id),
		listTicketBundles(ev.id),
		listTicketDiscounts(ev.id),
		listEventRoomsResolved(ev),
	]);

	const date = ev.starts_at ? new Date(ev.starts_at) : null;
	const dateLabel = date ? dateFmt.format(date) : null;
	const timeStart = date ? timeFmt.format(date) : null;
	const timeEnd = ev.ends_at ? timeFmt.format(new Date(ev.ends_at)) : null;
	const doorsTime = ev.doors_open_at ? timeFmt.format(new Date(ev.doors_open_at)) : null;

	const hasExtraInfo =
		Array.isArray(ev.extra_info_blocks) && ev.extra_info_blocks.length > 0;
	const hasAbout = Array.isArray(ev.body_blocks) && ev.body_blocks.length > 0;
	const hasFaqs = faqs.length > 0;
	const tabs = [];
	if (hasAbout || ev.summary) tabs.push({ value: "about", label: "About" });
	if (hasExtraInfo) tabs.push({ value: "extra", label: "Extra info" });
	if (hasFaqs) tabs.push({ value: "faqs", label: "FAQs" });

	const externalHref = ev.external_url || null;

	// schema.org Event structured data - picked up by Google for rich results.
	// Lowest-price ticket type is surfaced via offers.price (advisory; the
	// actual ticket selector handles real availability).
	const cheapestTicket = (ticketTypes ?? [])
		.filter((t) => (t.price_cents ?? 0) > 0)
		.sort((a, b) => (a.price_cents ?? 0) - (b.price_cents ?? 0))[0];
	const eventUrl = `${(process.env.BASE_URL || "").replace(/\/$/, "")}/events/${ev.slug}`;
	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "Event",
		name: ev.title,
		description: ev.summary ?? undefined,
		startDate: ev.starts_at ? new Date(ev.starts_at).toISOString() : undefined,
		endDate: ev.ends_at ? new Date(ev.ends_at).toISOString() : undefined,
		eventStatus:
			ev.status === "cancelled"
				? "https://schema.org/EventCancelled"
				: "https://schema.org/EventScheduled",
		eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
		image: ev.banner_url ? [ev.banner_url] : undefined,
		location: {
			"@type": "Place",
			name: venue.name,
			address: Array.isArray(venue.address_lines) && venue.address_lines.length
				? {
					"@type": "PostalAddress",
					streetAddress: venue.address_lines.join(", "),
					addressCountry: "GB",
				}
				: undefined,
		},
		organizer: {
			"@type": "Organization",
			name: venue.name,
			url: (process.env.BASE_URL || undefined),
		},
		offers: ev.is_ticketed && cheapestTicket
			? {
				"@type": "Offer",
				url: eventUrl,
				price: (cheapestTicket.price_cents / 100).toFixed(2),
				priceCurrency: "GBP",
				availability: "https://schema.org/InStock",
			}
			: undefined,
	};

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(jsonLd, (_k, v) => (v === undefined ? undefined : v)),
				}}
			/>
			{!isPublic && preview && (
				<div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs px-6 py-2 text-center">
					Preview - this event is{" "}
					<span className="font-medium">{ev.status}</span> /{" "}
					<span className="font-medium">{ev.visibility}</span> and not visible to the public.
				</div>
			)}

			{ev.banner_url ? (
				<section className="relative overflow-hidden h-[40svh]">
					<Image
						src={ev.banner_url}
						alt={ev.title}
						fill
						priority
						sizes="100vw"
						className="object-cover"
					/>
					<div
						aria-hidden
						className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-background to-transparent pointer-events-none"
					/>
				</section>
			) : (
				<Hero height="medium" title={ev.title} />
			)}

			<Section>
				<div className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
					<div className="space-y-8">
						{ev.banner_url && (
							<h1 className="font-display text-3xl sm:text-4xl tracking-tight leading-tight">
								{ev.title}
							</h1>
						)}

						{tabs.length > 0 && (
							<Tabs defaultValue={tabs[0].value} className="w-full">
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

								<TabsContent value="about" className="mt-8 space-y-6">
									{ev.summary && (
										<p className="text-lg leading-relaxed text-foreground/85 max-w-3xl whitespace-pre-line">
											{ev.summary}
										</p>
									)}
									{/* body_blocks: block renderer ships alongside the rooms block editor upgrade */}
								</TabsContent>

								{hasExtraInfo && (
									<TabsContent value="extra" className="mt-8 space-y-4">
										{/* extra_info_blocks: same block renderer */}
									</TabsContent>
								)}

								{hasFaqs && (
									<TabsContent value="faqs" className="mt-8 space-y-4">
										<ul className="space-y-4">
											{faqs.map((f) => (
												<li
													key={f.id}
													className="rounded-xl border border-foreground/10 bg-card p-5"
												>
													<h3 className="font-medium">{f.question}</h3>
													<p className="mt-2 text-sm text-foreground/85 whitespace-pre-line">
														{f.answer}
													</p>
												</li>
											))}
										</ul>
									</TabsContent>
								)}
							</Tabs>
						)}
					</div>

					<aside id="tickets" className="space-y-6 lg:sticky lg:top-28 self-start">
						<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-4">
							{dateLabel && (
								<div>
									<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
										Date
									</div>
									<div className="mt-1 font-display text-lg">{dateLabel}</div>
								</div>
							)}
							{(doorsTime || timeStart || timeEnd) && (
								<dl className="grid grid-cols-3 gap-2 sm:gap-3">
									<div>
										<dt className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
											Doors
										</dt>
										<dd className="mt-1 font-mono text-sm">{doorsTime ?? "-"}</dd>
									</div>
									<div>
										<dt className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
											Start
										</dt>
										<dd className="mt-1 font-mono text-sm">{timeStart ?? "-"}</dd>
									</div>
									<div>
										<dt className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
											End
										</dt>
										<dd className="mt-1 font-mono text-sm">{timeEnd ?? "-"}</dd>
									</div>
								</dl>
							)}
							{rooms.length > 0 && (
								<div>
									<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
										{rooms.length === 1 ? "Room" : "Rooms"}
									</div>
									<ul className="mt-1 text-sm space-y-0.5">
										{rooms.map((r) => (
											<li key={r.id}>{r.name}</li>
										))}
									</ul>
								</div>
							)}
							{!dateLabel && !doorsTime && !timeStart && !timeEnd && rooms.length === 0 && (
								<p className="text-sm text-muted-foreground">
									Details to be announced.
								</p>
							)}
						</section>

						{ev.is_ticketed && !externalHref ? (
							<TicketSelector
								eventId={ev.id}
								ticketTypes={ticketTypes}
								addons={addons}
								typeAddonLinks={typeAddonLinks}
								bundles={bundles}
								discounts={discounts}
							/>
						) : externalHref ? (
							<div className="rounded-xl border border-foreground/10 bg-card p-6 space-y-3">
								<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">
									Tickets
								</h2>
								<p className="text-sm text-foreground/85">
									Tickets are sold on the organiser&apos;s site.
								</p>
								<CtaButton href={externalHref} className="w-full">
									Buy tickets
								</CtaButton>
							</div>
						) : (
							<div className="rounded-xl border border-foreground/10 bg-card p-6 space-y-3">
								<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">
									Entry
								</h2>
								<p className="text-sm text-foreground/85">
									Free entry - no booking required.
								</p>
							</div>
						)}
					</aside>
				</div>
			</Section>
		</>
	);
}
