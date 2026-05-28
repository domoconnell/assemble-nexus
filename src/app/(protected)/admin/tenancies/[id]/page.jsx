import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { organisation } from "@/db/schema/entities/organisation.js";
import { contact } from "@/db/schema/entities/contact.js";
import { room } from "@/db/schema/entities/room.js";
import { requireCurrentVenue } from "@/db/queries/venue";
import {
	getTenancyById,
	listSessionsForTenancy,
	listInvoicesForTenancy,
	listAgreementsForTenancy,
} from "@/db/queries/tenancies";
import TenancyForm from "../_components/tenancy-form";
import SessionRow from "../_components/session-row";
import JourneyHeader from "../_components/journey-header";
import AgreementsSection from "../_components/agreements-section";
import DirectDebitSection from "../_components/direct-debit-section";
import DangerZone from "../_components/danger-zone";
import InvoicesSection from "../_components/invoices-section";

export const dynamic = "force-dynamic";


const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short", day: "numeric", month: "short", year: "numeric",
	hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
});

export default async function TenancyDetailPage({ params }) {
	const { id } = await params;
	const venue = await requireCurrentVenue();
	const t = await getTenancyById(id, { venueId: venue.id });
	if (!t) notFound();

	const [sessions, invoices, agreements, organisations, rooms] = await Promise.all([
		listSessionsForTenancy(id),
		listInvoicesForTenancy(id),
		listAgreementsForTenancy(id),
		db
			.select({
				id: organisation.id,
				name: organisation.name,
				primary_contact_id: organisation.primary_contact_id,
				primary_contact_name: contact.first_name,
			})
			.from(organisation)
			.leftJoin(contact, eq(contact.id, organisation.primary_contact_id))
			.where(and(eq(organisation.venue_id, venue.id), isNull(organisation.deletedAt)))
			.orderBy(asc(organisation.name)),
		db
			.select({
				id: room.id,
				name: room.name,
				is_public: room.is_public,
				is_published: room.is_published,
			})
			.from(room)
			.where(and(eq(room.venue_id, venue.id), isNull(room.deletedAt)))
			.orderBy(asc(room.sort_order), asc(room.name)),
	]);

	const now = new Date();
	const futureSessions = sessions.filter((s) => new Date(s.starts_at) >= now);
	const pastSessions = sessions.filter((s) => new Date(s.starts_at) < now).slice(-12).reverse();

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div>
				<Link href="/admin/tenancies" className="text-sm text-muted-foreground hover:text-foreground">
					← Tenancies
				</Link>
				<div className="mt-2 flex items-baseline justify-between gap-3 flex-wrap">
					<div>
						<h1 className="text-2xl font-semibold">
							{t.label || t.organisation_name || "(unnamed tenancy)"}
						</h1>
						<p className="text-sm text-muted-foreground mt-1">
							{t.kind === "private_rental" ? "Private rental" : "Scheduled recurring"} ·{" "}
							{t.organisation_id ? (
								<Link
									href={`/admin/crm/${t.organisation_id}`}
									className="hover:text-foreground underline-offset-2 hover:underline"
								>
									{t.organisation_name ?? "(unnamed)"}
								</Link>
							) : (
								t.organisation_name ?? "-"
							)}{" "}
							· {t.room_name}
						</p>
					</div>
					<span
						className={`text-[10px] uppercase tracking-[0.18em] rounded-full border px-2 py-0.5 ${
							t.status === "active"
								? "border-primary/30 bg-primary/10 text-primary"
								: t.status === "paused"
									? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
									: "border-foreground/15 text-muted-foreground"
						}`}
					>
						{t.status}
					</span>
				</div>
			</div>

			<JourneyHeader tenancy={t} agreements={agreements} />

			<DirectDebitSection tenancy={t} />

			<AgreementsSection tenancy={t} agreements={agreements} />

			{t.kind === "scheduled_recurring" && (
				<section className="space-y-3">
					<div className="flex items-baseline justify-between gap-3">
						<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							Upcoming sessions · {futureSessions.length}
						</h2>
					</div>
					{futureSessions.length === 0 ? (
						<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
							No future sessions materialised yet. The daily cron tops these up - give it
							a beat after creating the tenancy.
						</div>
					) : (
						<ul className="rounded-lg border bg-card divide-y divide-foreground/10 overflow-hidden">
							{futureSessions.map((s) => (
								<SessionRow key={s.id} session={s} dateFmt={dateFmt} />
							))}
						</ul>
					)}

					{pastSessions.length > 0 && (
						<details className="rounded-lg border bg-card overflow-hidden">
							<summary className="px-4 py-3 text-sm cursor-pointer hover:bg-accent/30">
								Recent past sessions ({pastSessions.length})
							</summary>
							<ul className="divide-y divide-foreground/10">
								{pastSessions.map((s) => (
									<SessionRow key={s.id} session={s} dateFmt={dateFmt} muted />
								))}
							</ul>
						</details>
					)}
				</section>
			)}

			<InvoicesSection
				invoices={invoices}
				invoiceDayOfMonth={t.invoice_day_of_month}
			/>

			<section className="space-y-3">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Edit
				</h2>
				<TenancyForm organisations={organisations} rooms={rooms} initial={t} />
			</section>

			<DangerZone tenancy={t} />
		</div>
	);
}
