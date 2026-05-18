import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { listTenancies } from "@/db/queries/tenancies";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtGbp = (c) => gbp.format((c ?? 0) / 100);

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London",
});

const WEEKDAY_LABEL = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };

function kindLabel(kind) {
	return kind === "private_rental" ? "Private rental" : "Scheduled recurring";
}

function scheduleSummary(t) {
	if (t.kind !== "scheduled_recurring") return null;
	const rule = t.schedule_rule;
	if (!rule?.by_weekday?.length) return null;
	const days = rule.by_weekday.map((d) => WEEKDAY_LABEL[d] ?? d).join(", ");
	return `${days} · ${rule.time_start}–${rule.time_end}`;
}

function rateLabel(t) {
	if (t.kind === "private_rental") {
		return t.monthly_rate_cents != null ? `${fmtGbp(t.monthly_rate_cents)} / month` : "—";
	}
	return t.per_session_rate_cents != null
		? `${fmtGbp(t.per_session_rate_cents)} / session`
		: "—";
}

export default async function TenanciesPage({ searchParams }) {
	const venue = await requireCurrentVenue();
	const sp = await searchParams;
	const includeEnded = sp?.show === "all";
	const rows = await listTenancies(venue.id, { includeEnded });

	const active = rows.filter((r) => r.status === "active");
	const paused = rows.filter((r) => r.status === "paused");
	const ended = rows.filter((r) => r.status === "ended");

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div>
					<h1 className="text-2xl font-semibold">Tenancies</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Ongoing room-use arrangements with monthly invoicing. Private rentals
						(flat monthly rate) and scheduled recurring bookings (per-session,
						billed monthly).
					</p>
				</div>
				<Link
					href="/admin/tenancies/new"
					className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
				>
					New tenancy
				</Link>
			</div>

			<TenancyGroup title="Active" rows={active} />
			{paused.length > 0 && <TenancyGroup title="Paused" rows={paused} />}

			<div className="flex items-baseline justify-between gap-3 pt-2">
				<Link
					href={includeEnded ? "/admin/tenancies" : "/admin/tenancies?show=all"}
					className="text-xs text-muted-foreground hover:text-foreground"
				>
					{includeEnded ? "Hide ended" : "Show ended"} →
				</Link>
			</div>
			{includeEnded && ended.length > 0 && (
				<TenancyGroup title="Ended" rows={ended} muted />
			)}
		</div>
	);
}

function TenancyGroup({ title, rows, muted }) {
	if (rows.length === 0) {
		return (
			<section className="space-y-3">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					{title}
				</h2>
				<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
					Nothing here yet.
				</div>
			</section>
		);
	}
	return (
		<section className="space-y-3">
			<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
				{title} · {rows.length}
			</h2>
			<ul className="rounded-lg border bg-card divide-y divide-foreground/10 overflow-hidden">
				{rows.map((t) => (
					<li key={t.id}>
						<Link
							href={`/admin/tenancies/${t.id}`}
							className={`flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-accent/40 transition ${muted ? "opacity-70" : ""}`}
						>
							<div className="min-w-0 flex-1">
								<div className="flex items-baseline gap-2 flex-wrap">
									<span className="text-sm font-medium truncate">
										{t.label || `${t.customer_first_name} ${t.customer_last_name}`}
									</span>
									<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground border border-foreground/15 rounded-full px-1.5 py-0.5">
										{kindLabel(t.kind)}
									</span>
									{!t.room_is_public && (
										<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
											private room
										</span>
									)}
								</div>
								<div className="text-xs text-muted-foreground mt-0.5">
									{t.customer_first_name} {t.customer_last_name} · {t.room_name}
									{scheduleSummary(t) && <> · {scheduleSummary(t)}</>}
									{" · "}
									from {dateFmt.format(new Date(t.starts_on))}
									{t.ends_on && <> → {dateFmt.format(new Date(t.ends_on))}</>}
								</div>
							</div>
							<div className="text-right text-sm shrink-0">
								<div className="font-mono">{rateLabel(t)}</div>
								<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
									Invoice on the {t.invoice_day_of_month}
									{t.invoice_day_of_month === 1
										? "st"
										: t.invoice_day_of_month === 2
											? "nd"
											: t.invoice_day_of_month === 3
												? "rd"
												: "th"}
								</div>
							</div>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
