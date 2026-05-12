import Link from "next/link";
import { notFound } from "next/navigation";
import {
	getBookingById,
	listBookingSegments,
	listBookingFacilitySelections,
	listBookingStatusEvents,
} from "@/db/queries/bookings";
import { getEventByBookingId } from "@/db/queries/events";
import BookingDetailActions from "../_components/booking-detail-actions";
import RecurrencePanel from "../_components/recurrence-panel";
import BookingOrganisationPicker from "../_components/booking-organisation-picker";
import { listOrganisations } from "@/db/queries/crm";
import { requireCurrentVenue } from "@/db/queries/venue";
import InternalNotesEditor from "../_components/internal-notes-editor";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});
const stampFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

function statusClass(status) {
	switch (status) {
		case "pending":
			return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
		case "approved":
		case "confirmed":
			return "border-primary/30 bg-primary/10 text-primary";
		case "rejected":
		case "cancelled":
			return "border-destructive/30 bg-destructive/10 text-destructive";
		default:
			return "border-foreground/15 bg-muted text-muted-foreground";
	}
}

export default async function AdminBookingDetailPage({ params }) {
	const { id } = await params;
	const booking = await getBookingById(id);
	if (!booking) notFound();

	const venue = await requireCurrentVenue();
	const [segments, facilities, statusEvents, organisations, linkedEvent] =
		await Promise.all([
			listBookingSegments(booking.id),
			listBookingFacilitySelections(booking.id),
			listBookingStatusEvents(booking.id),
			listOrganisations(venue.id),
			booking.ticketing_enabled
				? getEventByBookingId(booking.id)
				: Promise.resolve(null),
		]);
	const currentOrg = booking.organisation_id
		? organisations.find((o) => o.id === booking.organisation_id) ?? null
		: null;

	const segmentGroups = segments.reduce((acc, s) => {
		const key = s.booking_type_key ?? s.booking_type_label ?? "other";
		if (!acc.has(key)) {
			acc.set(key, { key, label: s.booking_type_label, items: [] });
		}
		acc.get(key).items.push(s);
		return acc;
	}, new Map());

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div>
				<Link href="/admin/bookings" className="text-sm text-muted-foreground hover:text-foreground">
					← All bookings
				</Link>
				<div className="mt-2 flex items-center gap-3 flex-wrap">
					<h1 className="text-2xl font-semibold">
						<span className="font-mono text-base text-muted-foreground mr-2">{booking.reference}</span>
						{booking.customer_first_name} {booking.customer_last_name}
					</h1>
					<span
						className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${statusClass(booking.status)}`}
					>
						{booking.status}
					</span>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					Submitted {booking.submitted_at ? stampFmt.format(new Date(booking.submitted_at)) : "—"}
				</p>
			</div>

			{linkedEvent && (
				<Link
					href={`/admin/events/${linkedEvent.id}`}
					className="block rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition"
				>
					<div className="flex items-baseline justify-between gap-4 flex-wrap">
						<div>
							<div className="text-xs uppercase tracking-[0.22em] text-primary">
								Ticketed event
							</div>
							<div className="font-medium mt-1">{linkedEvent.title}</div>
							<div className="text-xs text-muted-foreground mt-0.5 capitalize">
								Status: {linkedEvent.status.replace("_", " ")}
							</div>
						</div>
						<span className="text-xs text-muted-foreground">Manage event →</span>
					</div>
				</Link>
			)}

			<div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
				<div className="space-y-6">
					<section className="rounded-lg border bg-card p-6 space-y-4">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Customer</h2>
						<dl className="grid gap-2 text-sm sm:grid-cols-2">
							<div>
								<dt className="text-xs text-muted-foreground">Email</dt>
								<dd>
									<a className="hover:underline" href={`mailto:${booking.customer_email}`}>
										{booking.customer_email}
									</a>
								</dd>
							</div>
							{booking.customer_phone && (
								<div>
									<dt className="text-xs text-muted-foreground">Phone</dt>
									<dd>{booking.customer_phone}</dd>
								</div>
							)}
							{booking.customer_organisation && (
								<div className="sm:col-span-2">
									<dt className="text-xs text-muted-foreground">Organisation</dt>
									<dd>{booking.customer_organisation}</dd>
								</div>
							)}
						</dl>
						{booking.customer_notes && (
							<div>
								<div className="text-xs text-muted-foreground">Customer notes</div>
								<p className="mt-1 text-sm whitespace-pre-line">{booking.customer_notes}</p>
							</div>
						)}
					</section>

					<section className="rounded-lg border bg-card p-6 space-y-4">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Segments</h2>
						<div className="space-y-5">
							{[...segmentGroups.values()].map((g) => (
								<div key={g.key}>
									<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
										{g.label}
									</div>
									<ul className="space-y-2 text-sm">
										{g.items.map((s) => (
											<li
												key={s.id}
												className="flex items-baseline justify-between gap-4 border-t border-foreground/10 pt-2 first:border-t-0 first:pt-0"
											>
												<div className="min-w-0">
													<div>
														{dateFmt.format(new Date(s.starts_at))} ·{" "}
														{timeFmt.format(new Date(s.starts_at))}–
														{timeFmt.format(new Date(s.ends_at))}
													</div>
													<div className="text-xs text-muted-foreground">
														{s.room_name}
														{s.layout_label ? ` · ${s.layout_label}` : ""}
													</div>
												</div>
												<div className="font-mono text-sm shrink-0 whitespace-nowrap">
													{formatGbp(
														(s.computed_subtotal_cents ?? 0) + (s.computed_vat_cents ?? 0),
													)}
												</div>
											</li>
										))}
									</ul>
								</div>
							))}
						</div>
					</section>

					{facilities.length > 0 && (
						<section className="rounded-lg border bg-card p-6 space-y-3">
							<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Add-ons</h2>
							<ul className="space-y-1 text-sm">
								{facilities.map((f) => (
									<li
										key={f.id}
										className="flex items-baseline justify-between gap-4"
									>
										<span>
											{f.name_snapshot}
											{f.quantity > 1 ? ` × ${f.quantity}` : ""}
										</span>
										<span className="font-mono shrink-0 whitespace-nowrap">
											{formatGbp(
												(f.computed_subtotal_cents ?? 0) + (f.computed_vat_cents ?? 0),
											)}
										</span>
									</li>
								))}
							</ul>
						</section>
					)}

					<InternalNotesEditor bookingId={booking.id} initialValue={booking.internal_notes ?? ""} />

					<section className="rounded-lg border bg-card p-6 space-y-3">
						<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Activity</h2>
						{statusEvents.length === 0 ? (
							<p className="text-sm text-muted-foreground">No activity yet.</p>
						) : (
							<ol className="space-y-2 text-sm">
								{statusEvents.map((e) => (
									<li key={e.id} className="flex items-baseline justify-between gap-4">
										<div>
											<span className="font-medium">{e.to_status}</span>
											{e.note && (
												<span className="text-muted-foreground"> · {e.note}</span>
											)}
										</div>
										<span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
											{stampFmt.format(new Date(e.at))}
										</span>
									</li>
								))}
							</ol>
						)}
					</section>
				</div>

				<aside className="space-y-6">
					<section className="rounded-lg border border-primary/30 bg-primary/5 p-6 space-y-3">
						<h2 className="text-xs uppercase tracking-[0.2em] text-primary">Total</h2>
						<div className="font-display text-3xl tracking-tight">{formatGbp(booking.total_cents)}</div>
						<dl className="space-y-1 text-sm pt-3 border-t border-foreground/10">
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Subtotal</dt>
								<dd className="font-mono">{formatGbp(booking.subtotal_cents)}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">VAT</dt>
								<dd className="font-mono">{formatGbp(booking.vat_cents)}</dd>
							</div>
							{booking.discount_amount_cents > 0 && (
								<div className="flex justify-between">
									<dt className="text-muted-foreground">
										{booking.discount_label_snapshot ?? "Discount"}
									</dt>
									<dd className="font-mono text-primary">
										−{formatGbp(booking.discount_amount_cents)}
									</dd>
								</div>
							)}
							{booking.ticketing_setup_fee_cents > 0 && (
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Ticketing setup</dt>
									<dd className="font-mono">{formatGbp(booking.ticketing_setup_fee_cents)}</dd>
								</div>
							)}
							{booking.deposit_required_cents > 0 && (
								<div className="flex justify-between pt-2 border-t border-foreground/10 mt-2">
									<dt className="text-muted-foreground">Deposit required</dt>
									<dd className="font-mono">{formatGbp(booking.deposit_required_cents)}</dd>
								</div>
							)}
							{booking.deposit_paid_cents > 0 && (
								<div className="flex justify-between text-primary">
									<dt>Deposit paid</dt>
									<dd className="font-mono">{formatGbp(booking.deposit_paid_cents)}</dd>
								</div>
							)}
							{booking.balance_paid_cents > 0 && (
								<div className="flex justify-between text-primary">
									<dt>Balance paid</dt>
									<dd className="font-mono">{formatGbp(booking.balance_paid_cents)}</dd>
								</div>
							)}
							{(() => {
								const outstanding = Math.max(
									0,
									(booking.total_cents ?? 0) -
										(booking.deposit_paid_cents ?? 0) -
										(booking.balance_paid_cents ?? 0),
								);
								return outstanding > 0 ? (
									<div className="flex justify-between pt-2 border-t border-foreground/10 mt-2">
										<dt className="text-muted-foreground">Outstanding</dt>
										<dd className="font-mono">{formatGbp(outstanding)}</dd>
									</div>
								) : null;
							})()}
						</dl>
					</section>

					<BookingDetailActions
						bookingId={booking.id}
						status={booking.status}
						depositRequiredCents={booking.deposit_required_cents ?? 0}
						depositPaidCents={booking.deposit_paid_cents ?? 0}
						balancePaidCents={booking.balance_paid_cents ?? 0}
						totalCents={booking.total_cents ?? 0}
						balanceInvoiceIssuedAt={booking.balance_invoice_issued_at ?? null}
					/>

					<RecurrencePanel
						bookingId={booking.id}
						bookingStatus={booking.status}
						segments={segments}
						rule={booking.recurrence_rule ?? null}
					/>

					<BookingOrganisationPicker
						bookingId={booking.id}
						currentOrgId={booking.organisation_id ?? null}
						currentOrgName={currentOrg?.name ?? null}
						organisations={organisations}
					/>
				</aside>
			</div>
		</div>
	);
}
