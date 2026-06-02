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
	listLinesForTenancy,
	listSessionsForTenancy,
	listInvoicesForTenancy,
	listAgreementsForTenancy,
} from "@/db/queries/tenancies";
import { listRoomRackHourlyRates } from "@/db/queries/room-rack-rates.js";
import TenancyForm from "../_components/tenancy-form";
import SessionsSection from "../_components/sessions-section";
import JourneyHeader from "../_components/journey-header";
import AgreementsSection from "../_components/agreements-section";
import DirectDebitSection from "../_components/direct-debit-section";
import DangerZone from "../_components/danger-zone";
import InvoicesSection from "../_components/invoices-section";

export const dynamic = "force-dynamic";


export default async function TenancyDetailPage({ params }) {
	const { id } = await params;
	const venue = await requireCurrentVenue();
	const t = await getTenancyById(id, { venueId: venue.id });
	if (!t) notFound();

	const [lines, sessions, invoices, agreements, organisations, rooms, roomRackRates] = await Promise.all([
		listLinesForTenancy(id),
		listSessionsForTenancy(id),
		listInvoicesForTenancy(id),
		listAgreementsForTenancy(id),
		db
			.select({
				id: organisation.id,
				name: organisation.name,
				primary_contact_id: organisation.primary_contact_id,
				primary_contact_name: contact.first_name,
				primary_contact_email: contact.email,
				dd_token: organisation.dd_token,
				direct_debit_ready_at: organisation.direct_debit_ready_at,
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
		listRoomRackHourlyRates(venue.id),
	]);

	const now = new Date();
	const futureSessions = sessions.filter((s) => new Date(s.starts_at) >= now);
	const pastSessions = sessions.filter((s) => new Date(s.starts_at) < now).slice(-12).reverse();
	const hasScheduledLines = lines.some((l) => l.kind === "scheduled");

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
							{t.organisation_id ? (
								<Link
									href={`/admin/crm/${t.organisation_id}`}
									className="hover:text-foreground underline-offset-2 hover:underline"
								>
									{t.organisation_name ?? "(unnamed)"}
								</Link>
							) : (
								t.organisation_name ?? "-"
							)}
							{" · "}
							{lines.length} line{lines.length === 1 ? "" : "s"} ·{" "}
							{lines.map((l) => l.room_name).filter(Boolean).join(", ") || "no rooms yet"}
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

			{hasScheduledLines && (
				<SessionsSection
					tenancyId={t.id}
					futureSessions={futureSessions}
					pastSessions={pastSessions}
				/>
			)}

			<InvoicesSection
				invoices={invoices}
				invoiceDayOfMonth={t.invoice_day_of_month}
				tenancyId={t.id}
				tenancyStartsOn={t.starts_on}
				ddReady={!!t.org_direct_debit_ready_at}
			/>

			<section className="space-y-3">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Edit
				</h2>
				<TenancyForm
					organisations={organisations}
					rooms={rooms}
					roomRackRates={roomRackRates}
					initial={{ ...t, lines }}
				/>
			</section>

			<DangerZone tenancy={t} />
		</div>
	);
}
