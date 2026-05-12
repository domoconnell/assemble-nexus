import Link from "next/link";
import { notFound } from "next/navigation";
import {
	getBookingForUser,
	listBookingSegments,
	listBookingFacilitySelections,
} from "@/db/queries/bookings";
import { Container } from "@/site/ui/container";
import { Hero } from "@/site/ui/hero";
import { requireServerSession } from "@/utils/auth/server-guard";

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

export default async function MyEventsBookingPage({ params }) {
	const { id } = await params;
	const session = await requireServerSession({
		redirectTo: `/auth/login?callbackURL=/my-events/bookings/${id}`,
	});
	const b = await getBookingForUser(id, session.user.id);
	if (!b) notFound();

	const [segments, facilities] = await Promise.all([
		listBookingSegments(b.id),
		listBookingFacilitySelections(b.id),
	]);

	const segmentGroups = segments.reduce((acc, s) => {
		const key = s.booking_type_key ?? "other";
		if (!acc.has(key)) acc.set(key, { key, label: s.booking_type_label, items: [] });
		acc.get(key).items.push(s);
		return acc;
	}, new Map());

	return (
		<>
			<Hero
				height="short"
				kicker="Booking"
				title={b.reference}
				subtitle="Your booking details and current status."
			/>
			<Container className="py-12 lg:py-16">
				<Link
					href="/my-events"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← All your events
				</Link>

				<div className="mt-4 flex items-center gap-3 flex-wrap">
					<span
						className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${statusClass(b.status)}`}
					>
						{b.status}
					</span>
					<span className="text-sm text-muted-foreground">
						Submitted {b.submitted_at ? stampFmt.format(new Date(b.submitted_at)) : "—"}
					</span>
				</div>

				<div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] mt-8">
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
						<section className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-3">
							<h2 className="text-xs uppercase tracking-[0.22em] text-primary">Total</h2>
							<div className="font-display text-3xl tracking-tight">
								{formatGbp(b.total_cents)}
							</div>
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
								{b.deposit_required_cents > 0 && (
									<div className="flex justify-between pt-2 border-t border-foreground/10 mt-2">
										<dt className="text-muted-foreground">Deposit on approval</dt>
										<dd className="font-mono">
											{formatGbp(b.deposit_required_cents)}
										</dd>
									</div>
								)}
							</dl>
						</section>
					</aside>
				</div>
			</Container>
		</>
	);
}
