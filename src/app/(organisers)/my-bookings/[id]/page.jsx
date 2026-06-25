import Link from "next/link";
import { notFound } from "next/navigation";
import {
	getBookingForUser,
	listBookingSegments,
	listBookingFacilitySelections,
	listBookingPayments,
} from "@/db/queries/bookings";
import { getEventByBookingId, countEventTickets } from "@/db/queries/events";
import { getServerSession } from "@/utils/auth/server-guard";

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

function eventStatusClass(status) {
	switch (status) {
		case "draft":
			return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
		case "awaiting_approval":
			return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
		case "published":
		case "approved":
			return "border-primary/30 bg-primary/10 text-primary";
		case "cancelled":
		case "rejected":
			return "border-destructive/30 bg-destructive/10 text-destructive";
		default:
			return "border-foreground/15 text-muted-foreground";
	}
}

export async function generateMetadata({ params }) {
	const { id } = await params;
	return {
		title: `Booking ${id.slice(0, 6)} - The Assembly Rooms`,
		robots: { index: false, follow: false },
	};
}

export default async function MyBookingDetailPage({ params }) {
	const { id } = await params;
	// Auth gate + booking-ownership lookup happen in the shared layout
	// at /my-bookings/[id]/layout.jsx — we only fetch what this page needs
	// to render its body.
	const session = await getServerSession();
	const b = await getBookingForUser(id, session.user.id);
	if (!b) notFound();

	const [segments, facilities, linkedEvent, payments] = await Promise.all([
		listBookingSegments(b.id),
		listBookingFacilitySelections(b.id),
		b.ticketing_enabled ? getEventByBookingId(b.id) : Promise.resolve(null),
		listBookingPayments(b.id),
	]);
	const eventStats = linkedEvent ? await countEventTickets(linkedEvent.id) : null;

	const segmentGroups = segments.reduce((acc, s) => {
		const key = s.booking_type_key ?? "other";
		if (!acc.has(key)) acc.set(key, { key, label: s.booking_type_label, items: [] });
		acc.get(key).items.push(s);
		return acc;
	}, new Map());

	// Prefer the installments table as the source of truth when it
	// exists (admin-configured splits or post-approval defaults). Falls
	// back to the legacy deposit_paid_cents + balance_paid_cents on
	// pending bookings that haven't been approved yet.
	const paidFromPayments = payments
		.filter((p) => p.paid_at)
		.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
	const paidLegacy = (b.deposit_paid_cents ?? 0) + (b.balance_paid_cents ?? 0);
	const paidCents = payments.length > 0 ? paidFromPayments : paidLegacy;
	const outstandingCents = Math.max(0, (b.total_cents ?? 0) - paidCents);
	const canPayNow = b.status === "approved" || b.status === "confirmed";
	const nextUnpaid = canPayNow ? payments.find((p) => !p.paid_at) : null;
	const isFullyPaid = outstandingCents === 0 && payments.length > 0;

	return (
		<>
			<div className="flex items-center gap-3 flex-wrap">
					<span
						className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${statusClass(b.status)}`}
					>
						{b.status}
					</span>
					<span className="text-sm text-muted-foreground">
						Submitted{" "}
						{b.submitted_at ? stampFmt.format(new Date(b.submitted_at)) : "-"}
					</span>
				</div>

				{b.status === "pending" && (
					<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
						<div className="font-medium text-amber-700 dark:text-amber-300">
							Thanks - we&apos;ve received your enquiry.
						</div>
						<div className="text-muted-foreground mt-1">
							We&apos;ll review the dates against the calendar and email you within a working day. Reference{" "}
							<span className="font-mono text-foreground">{b.reference}</span>.
						</div>
					</div>
				)}

				{linkedEvent && (
					<Link
						href={`/my-events/${linkedEvent.id}`}
						className="block rounded-xl border border-primary/30 bg-primary/5 p-5 hover:bg-primary/10 transition"
					>
						<div className="flex items-baseline justify-between gap-4 flex-wrap">
							<div className="min-w-0">
								<div className="text-xs uppercase tracking-[0.22em] text-primary">
									Ticketed event
								</div>
								<div className="font-medium mt-1 truncate">{linkedEvent.title}</div>
								<div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
									<span
										className={`inline-flex items-center rounded-full border px-2 py-0.5 uppercase tracking-[0.15em] ${eventStatusClass(linkedEvent.status)}`}
									>
										{(linkedEvent.status || "draft").replace("_", " ")}
									</span>
									{linkedEvent.visibility && (
										<span className="text-muted-foreground">
											{linkedEvent.visibility === "public" ? "Public" : "Private"}
										</span>
									)}
									{linkedEvent.starts_at && (
										<span className="text-muted-foreground">
											· {stampFmt.format(new Date(linkedEvent.starts_at))}
										</span>
									)}
								</div>
							</div>
							<span className="text-xs text-muted-foreground shrink-0">
								Manage event →
							</span>
						</div>
						{eventStats && (
							<dl className="mt-4 pt-3 border-t border-primary/15 grid grid-cols-3 gap-3 text-sm">
								<div>
									<dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
										Sold
									</dt>
									<dd className="font-display text-xl">
										{eventStats.total ?? 0}
									</dd>
								</div>
								<div>
									<dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
										Checked in
									</dt>
									<dd className="font-display text-xl">
										{eventStats.used ?? 0}
									</dd>
								</div>
								<div>
									<dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
										Outstanding
									</dt>
									<dd className="font-display text-xl">
										{(eventStats.total ?? 0) - (eventStats.used ?? 0)}
									</dd>
								</div>
							</dl>
						)}
					</Link>
				)}

				<div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
					<div className="space-y-6">
						<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-4">
							<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
								Schedule
							</h2>
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
															{timeFmt.format(new Date(s.starts_at))}-
															{timeFmt.format(new Date(s.ends_at))}
														</div>
														<div className="text-xs text-muted-foreground">
															{s.room_name}
															{s.layout_label ? ` · ${s.layout_label}` : ""}
														</div>
													</div>
													<div className="font-mono text-sm shrink-0 whitespace-nowrap">
														{formatGbp(
															(s.computed_subtotal_cents ?? 0) +
																(s.computed_vat_cents ?? 0),
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
							<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-3">
								<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
									Add-ons
								</h2>
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
													(f.computed_subtotal_cents ?? 0) +
														(f.computed_vat_cents ?? 0),
												)}
											</span>
										</li>
									))}
								</ul>
							</section>
						)}

						{b.customer_notes && (
							<section className="rounded-xl border border-foreground/10 bg-card p-6 space-y-2">
								<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
									Notes you sent us
								</h2>
								<p className="text-sm whitespace-pre-line">{b.customer_notes}</p>
							</section>
						)}
					</div>

					<aside>
						<section
							className={`rounded-xl border p-6 space-y-3 ${
								isFullyPaid
									? "border-primary/30 bg-primary/5"
									: "border-amber-500/30 bg-amber-500/10"
							}`}
						>
							<h2
								className={`text-xs uppercase tracking-[0.22em] ${
									isFullyPaid ? "text-primary" : "text-amber-600 dark:text-amber-400"
								}`}
							>
								{isFullyPaid ? "Paid in full" : "Total"}
							</h2>
							<div className="font-display text-3xl tracking-tight">
								{formatGbp(b.total_cents)}
							</div>
							{nextUnpaid && (
								<Link
									href={`/my-bookings/${b.id}/pay/${nextUnpaid.id}`}
									className="block w-full rounded-md bg-primary text-primary-foreground text-center px-4 py-3 font-medium hover:opacity-90 transition"
								>
									Pay {formatGbp(nextUnpaid.amount_cents)} ({nextUnpaid.label}) now →
								</Link>
							)}
							<dl className="space-y-1 text-sm pt-3 border-t border-foreground/10">
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Subtotal</dt>
									<dd className="font-mono">{formatGbp(b.subtotal_cents)}</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-muted-foreground">VAT</dt>
									<dd className="font-mono">{formatGbp(b.vat_cents)}</dd>
								</div>
								{b.discount_amount_cents > 0 && (
									<div className="flex justify-between">
										<dt className="text-muted-foreground">
											{b.discount_label_snapshot ?? "Discount"}
										</dt>
										<dd className="font-mono text-primary">
											−{formatGbp(b.discount_amount_cents)}
										</dd>
									</div>
								)}
								{b.ticketing_setup_fee_cents > 0 && (
									<div className="flex justify-between">
										<dt className="text-muted-foreground">Ticketing setup</dt>
										<dd className="font-mono">
											{formatGbp(b.ticketing_setup_fee_cents)}
										</dd>
									</div>
								)}
								{payments.length > 0 ? (
									<div className="border-t border-foreground/10 pt-2 mt-2 space-y-1.5">
										{payments.map((p) => {
											const isPaid = !!p.paid_at;
											return (
												<div
													key={p.id}
													className="flex items-baseline justify-between gap-3"
												>
													<dt className="text-muted-foreground">
														{p.label}
														{isPaid && (
															<span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-primary">
																paid
															</span>
														)}
													</dt>
													<dd className="flex items-baseline gap-3">
														<span className="font-mono">{formatGbp(p.amount_cents)}</span>
														{!isPaid && canPayNow && (
															<Link
																href={`/my-bookings/${b.id}/pay/${p.id}`}
																className="text-xs text-primary hover:underline whitespace-nowrap"
															>
																Pay →
															</Link>
														)}
													</dd>
												</div>
											);
										})}
										<div className="flex justify-between font-medium pt-2 border-t border-foreground/10 mt-2">
											<dt>Outstanding</dt>
											<dd className="font-mono">{formatGbp(outstandingCents)}</dd>
										</div>
									</div>
								) : (
									<div className="border-t border-foreground/10 pt-2 mt-2 space-y-1">
										{b.deposit_required_cents > 0 && b.status === "pending" && (
											<div className="flex justify-between">
												<dt className="text-muted-foreground">Deposit on approval</dt>
												<dd className="font-mono">
													{formatGbp(b.deposit_required_cents)}
												</dd>
											</div>
										)}
										<div className="flex justify-between font-medium">
											<dt>Outstanding</dt>
											<dd className="font-mono">{formatGbp(outstandingCents)}</dd>
										</div>
									</div>
								)}
							</dl>
						</section>
					</aside>
				</div>
		</>
	);
}
