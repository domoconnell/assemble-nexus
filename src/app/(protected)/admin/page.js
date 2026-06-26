import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { listEventsAwaitingApproval, listUpcomingEvents } from "@/db/queries/events";
import {
	listBookingsForAdmin,
	sumOutstandingBalances,
	listSegmentsInRange,
	listBlockoutsInRange,
	listDayActivityForMonth,
} from "@/db/queries/bookings";
import { getMonthlyPnl, listMonthlyPnlForRange } from "@/db/queries/finance";
import { listOutstandingTenancyInvoices, listTenancySessionsForRange } from "@/db/queries/tenancies";
import { getCombinedLatestBalance, getBankInOutBetween } from "@/db/queries/bank";
import {
	getTopEventsBySales,
	getPerOrganiserRevenue,
	getBookingPipelineCounts,
	getRecentActivity,
} from "@/db/queries/dashboard";
import { currentMonthLondon, resolveMonth, monthLabel } from "@/lib/finance/months";
import { getServerSession } from "@/utils/auth/server-guard";
import PnlTrendChart from "./_components/pnl-trend-chart";
import ActivityCalendar from "./_components/activity-calendar";
import PublishEventButton from "./_components/publish-event-button";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

const dayFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
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
	timeZone: "Europe/London",
});

function londonDayKey(d) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/London",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(d);
}

export default async function HomePage() {
	const session = await getServerSession();
	const venue = await requireCurrentVenue();

	const month = resolveMonth(currentMonthLondon().ym);

	const now = new Date();
	const todayKey = londonDayKey(now);
	const todayStart = new Date(`${todayKey}T00:00:00Z`);
	const sevenDays = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

	const [
		pnl,
		pendingBookings,
		pendingEvents,
		outstandingCents,
		segments,
		blockouts,
		tenancySessionsThisWeek,
		dayActivity,
		monthlyTrend,
		upcomingEvents,
		bankSnapshot,
		bankInOut,
		topEvents,
		perOrganiser,
		pipeline,
		recentActivity,
		outstandingTenancyInvoices,
	] = await Promise.all([
		getMonthlyPnl(venue.id, {
			ymdFirstOfMonth: month.ymdFirstOfMonth,
			ymdFirstOfNextMonth: month.ymdFirstOfNextMonth,
			monthStartDate: month.monthStartDate,
			monthEndDate: month.monthEndDate,
		}),
		listBookingsForAdmin(venue.id, { tab: "pending" }),
		listEventsAwaitingApproval(venue.id),
		sumOutstandingBalances(venue.id),
		listSegmentsInRange(venue.id, todayStart, sevenDays),
		listBlockoutsInRange(venue.id, todayStart, sevenDays),
		listTenancySessionsForRange(venue.id, todayStart, sevenDays),
		listDayActivityForMonth(venue.id, month.monthStartDate, month.monthEndDate),
		listMonthlyPnlForRange(venue.id, { endYm: month.ym, monthsBack: 12 }),
		listUpcomingEvents(venue.id, { limit: 10 }),
		getCombinedLatestBalance(venue.id),
		getBankInOutBetween(venue.id, month.monthStartDate, month.monthEndDate),
		getTopEventsBySales(venue.id, { limit: 5 }),
		getPerOrganiserRevenue(venue.id, { limit: 5 }),
		getBookingPipelineCounts(venue.id, { monthsBack: 3 }),
		getRecentActivity(venue.id, { limit: 5 }),
		listOutstandingTenancyInvoices(venue.id),
	]);

	const tenancyOwedCents = outstandingTenancyInvoices.reduce(
		(sum, inv) => sum + (inv.total_cents ?? 0),
		0,
	);

	const todayItems = combineScheduleItems(segments, blockouts, tenancySessionsThisWeek, todayKey, true);
	const weekItems = combineScheduleItems(segments, blockouts, tenancySessionsThisWeek, todayKey, false);

	const greeting =
		session?.user?.first_name ? `, ${session.user.first_name}` : "";

	return (
		<main className="flex flex-1 flex-col gap-6 p-6 lg:p-10 max-w-6xl mx-auto w-full">
			<div className="space-y-1">
				<h1 className="text-2xl font-semibold">Welcome{greeting}</h1>
				<p className="text-muted-foreground text-sm">
					{monthLabel(month.year, month.month1)} · {venue.name}
				</p>
			</div>

			<WaterfallSection pnl={pnl} />

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<PendingBookingsWidget bookings={pendingBookings} />
				<PendingEventsWidget events={pendingEvents} />
				<StatCard
					label="Outstanding balances"
					value={formatGbp(outstandingCents)}
					tone={outstandingCents > 0 ? "default" : "muted"}
					href="/admin/bookings"
					sub="Across approved & confirmed bookings"
				/>
				<StatCard
					label="Tenancy invoices owed"
					value={formatGbp(tenancyOwedCents)}
					tone={tenancyOwedCents > 0 ? "default" : "muted"}
					href="/admin/tenancies"
					sub={
						outstandingTenancyInvoices.length > 0
							? `${outstandingTenancyInvoices.length} invoice${
									outstandingTenancyInvoices.length === 1 ? "" : "s"
								} unpaid`
							: "All tenancy invoices settled"
					}
				/>
			</div>

			{bankSnapshot && (
				<BankBalanceWidget snapshot={bankSnapshot} inOut={bankInOut} monthName={monthLabel(month.year, month.month1)} />
			)}

			<section className="rounded-xl border bg-card p-6 space-y-4">
				<div className="flex items-baseline justify-between gap-3 flex-wrap">
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
						Income vs costs · last 12 months
					</h2>
					<Link
						href="/admin/ledger"
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						Ledger detail →
					</Link>
				</div>
				<PnlTrendChart months={monthlyTrend} />
			</section>

			<div className="grid gap-6 lg:grid-cols-2">
				<TopEventsCard events={topEvents} />
				<TopOrganisersCard organisations={perOrganiser} />
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				<PipelineFunnelCard counts={pipeline} />
				<RecentActivityCard items={recentActivity} />
			</div>

			<div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
				<div className="space-y-6">
					<ScheduleCard
						title="Today"
						items={todayItems}
						emptyMessage="Nothing on today."
					/>
					<ScheduleCard
						title="Next 7 days"
						items={weekItems}
						emptyMessage="Nothing scheduled."
						groupByDay
					/>
				</div>
				<section className="rounded-xl border bg-card p-4">
					<ActivityCalendar
						year={month.year}
						month1={month.month1}
						activity={dayActivity}
						todayKey={todayKey}
					/>
				</section>
			</div>

			<UpcomingEventsCard events={upcomingEvents} />
		</main>
	);
}

function PendingBookingsWidget({ bookings }) {
	const count = bookings.length;
	return (
		<div
			className={`rounded-xl border p-4 space-y-3 ${
				count > 0
					? "border-amber-500/30 bg-amber-500/5"
					: "border-foreground/10 bg-card"
			}`}
		>
			<div className="flex items-baseline justify-between gap-3">
				<div>
					<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
						Pending bookings
					</div>
					<div className="font-mono tabular-nums text-2xl mt-1">{count}</div>
				</div>
				<Link
					href="/admin/bookings"
					className="text-xs text-muted-foreground hover:text-foreground"
				>
					Inbox →
				</Link>
			</div>
			{count === 0 ? (
				<p className="text-xs text-muted-foreground">Inbox clear.</p>
			) : (
				<ul className="space-y-1">
					{bookings.slice(0, 5).map((b) => (
						<li key={b.id}>
							<Link
								href={`/admin/bookings/${b.id}`}
								className="flex items-baseline justify-between gap-2 rounded-md border border-foreground/10 bg-background px-2.5 py-1.5 hover:border-foreground/30 transition text-xs"
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-baseline gap-2">
										<span className="font-mono text-muted-foreground">
											{b.reference}
										</span>
										<span className="font-medium truncate">
											{b.customer_first_name} {b.customer_last_name}
										</span>
									</div>
									{b.customer_organisation && (
										<div className="text-[10px] text-muted-foreground truncate">
											{b.customer_organisation}
										</div>
									)}
								</div>
								<span className="font-mono shrink-0">
									{formatGbp(b.total_cents)}
								</span>
							</Link>
						</li>
					))}
					{count > 5 && (
						<li className="text-[10px] text-muted-foreground pl-1">
							+{count - 5} more
						</li>
					)}
				</ul>
			)}
		</div>
	);
}

function BankBalanceWidget({ snapshot, inOut, monthName }) {
	const cleared = (snapshot.cleared_minor ?? 0) / 100;
	const inDelta = (inOut?.in_minor ?? 0) / 100;
	const outDelta = (inOut?.out_minor ?? 0) / 100;
	const net = (inOut?.net_minor ?? 0) / 100;
	const captured = new Date(snapshot.captured_at);
	const accountCount = snapshot.account_count ?? 1;
	const fmt = new Intl.NumberFormat("en-GB", {
		style: "currency",
		currency: snapshot.currency || "GBP",
	});
	return (
		<Link
			href="/admin/ledger/banking"
			className="block rounded-xl border border-foreground/10 bg-card p-5 hover:border-foreground/30 transition"
		>
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div>
					<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
						Bank balance · {accountCount} account{accountCount === 1 ? "" : "s"}
					</div>
					<div className="font-display text-3xl tracking-tight mt-1">{fmt.format(cleared)}</div>
					<div className="text-[10px] text-muted-foreground mt-1">
						As at {stampFmt.format(captured)}
					</div>
				</div>
				<div className="grid grid-cols-3 gap-4 text-right text-sm">
					<div>
						<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							In · {monthName}
						</div>
						<div className="font-mono tabular-nums text-primary mt-0.5">+{fmt.format(inDelta)}</div>
					</div>
					<div>
						<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							Out · {monthName}
						</div>
						<div className="font-mono tabular-nums text-destructive mt-0.5">−{fmt.format(outDelta)}</div>
					</div>
					<div>
						<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							Net
						</div>
						<div className={`font-mono tabular-nums mt-0.5 ${net >= 0 ? "text-primary" : "text-destructive"}`}>
							{net >= 0 ? "+" : "−"}{fmt.format(Math.abs(net))}
						</div>
					</div>
				</div>
			</div>
		</Link>
	);
}

function PendingEventsWidget({ events }) {
	const count = events.length;
	return (
		<div
			className={`rounded-xl border p-4 space-y-3 ${
				count > 0
					? "border-amber-500/30 bg-amber-500/5"
					: "border-foreground/10 bg-card"
			}`}
		>
			<div className="flex items-baseline justify-between gap-3">
				<div>
					<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
						Events pending approval
					</div>
					<div className="font-mono tabular-nums text-2xl mt-1">{count}</div>
				</div>
			</div>
			{count === 0 ? (
				<p className="text-xs text-muted-foreground">Nothing waiting.</p>
			) : (
				<ul className="space-y-1">
					{events.slice(0, 5).map((e) => (
						<li
							key={e.id}
							className="flex items-center gap-2 rounded-md border border-foreground/10 bg-background pl-2.5 pr-1.5 py-1.5 hover:border-foreground/30 transition text-xs"
						>
							<Link
								href={`/admin/events/${e.id}`}
								className="min-w-0 flex-1"
							>
								<div className="font-medium truncate">{e.title}</div>
								<div className="text-[10px] text-muted-foreground">
									Submitted {stampFmt.format(new Date(e.updatedAt))}
								</div>
							</Link>
							<PublishEventButton eventId={e.id} />
						</li>
					))}
					{count > 5 && (
						<li className="text-[10px] text-muted-foreground pl-1">
							+{count - 5} more
						</li>
					)}
				</ul>
			)}
		</div>
	);
}

function relativeTimeFromNow(target) {
	const now = Date.now();
	const ms = new Date(target).getTime() - now;
	if (ms < 0) return "started";
	const days = Math.floor(ms / (1000 * 60 * 60 * 24));
	if (days === 0) return "today";
	if (days === 1) return "tomorrow";
	if (days < 7) return `in ${days} days`;
	if (days < 14) return "in 1 week";
	if (days < 60) return `in ${Math.round(days / 7)} weeks`;
	if (days < 365) return `in ${Math.round(days / 30)} months`;
	return `in ${Math.round(days / 365)} year${days >= 547 ? "s" : ""}`;
}

function UpcomingEventsCard({ events }) {
	return (
		<section className="rounded-xl border bg-card p-6 space-y-3">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					Upcoming events
				</h2>
				<Link
					href="/admin/events"
					className="text-xs text-muted-foreground hover:text-foreground"
				>
					All events →
				</Link>
			</div>
			{events.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No events on the horizon.
				</p>
			) : (
				<ul className="space-y-2">
					{events.map((e) => (
						<li key={e.id}>
							<Link
								href={`/admin/events/${e.id}`}
								className="flex items-baseline justify-between gap-4 rounded-lg border border-foreground/10 bg-background p-3 hover:border-foreground/30 transition"
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-baseline gap-3 flex-wrap">
										<span className="font-medium truncate">{e.title}</span>
										<span
											className={`text-[10px] uppercase tracking-[0.15em] inline-flex items-center rounded-full border px-2 py-0.5 ${
												e.status === "published"
													? "border-primary/30 bg-primary/10 text-primary"
													: e.status === "pending_review"
														? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
														: "border-foreground/15 bg-muted text-muted-foreground"
											}`}
										>
											{e.status.replace("_", " ")}
										</span>
									</div>
									<div className="text-xs text-muted-foreground">
										{stampFmt.format(new Date(e.starts_at))}
									</div>
								</div>
								<div className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
									{relativeTimeFromNow(e.starts_at)}
								</div>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function TopEventsCard({ events }) {
	return (
		<section className="rounded-xl border bg-card p-5 space-y-3">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					Top events by sales
				</h2>
				<Link href="/admin/events" className="text-xs text-muted-foreground hover:text-foreground">
					All events →
				</Link>
			</div>
			{events.length === 0 ? (
				<p className="text-sm text-muted-foreground">No paid ticket orders yet.</p>
			) : (
				<ul className="space-y-1.5">
					{events.map((e, i) => (
						<li key={e.id}>
							<Link
								href={`/admin/events/${e.id}`}
								className="flex items-baseline justify-between gap-3 rounded-md border border-foreground/10 bg-background px-3 py-2 hover:border-foreground/30 transition"
							>
								<div className="flex items-baseline gap-3 min-w-0 flex-1">
									<span className="font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</span>
									<div className="min-w-0 flex-1">
										<div className="text-sm font-medium truncate">{e.title}</div>
										<div className="text-[10px] text-muted-foreground">
											{e.orders_count} order{e.orders_count === 1 ? "" : "s"}
											{e.starts_at ? ` · ${stampFmt.format(new Date(e.starts_at))}` : ""}
										</div>
									</div>
								</div>
								<span className="font-mono text-sm tabular-nums shrink-0">{formatGbp(e.revenue_cents)}</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function TopOrganisersCard({ organisations }) {
	return (
		<section className="rounded-xl border bg-card p-5 space-y-3">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					Per-organiser revenue
				</h2>
				<Link href="/admin/contacts/organisations" className="text-xs text-muted-foreground hover:text-foreground">
					All organisations →
				</Link>
			</div>
			{organisations.length === 0 ? (
				<p className="text-sm text-muted-foreground">No organisation-attributed ticket sales yet.</p>
			) : (
				<ul className="space-y-1.5">
					{organisations.map((o, i) => (
						<li key={o.id}>
							<Link
								href={`/admin/contacts/organisations/${o.id}`}
								className="flex items-baseline justify-between gap-3 rounded-md border border-foreground/10 bg-background px-3 py-2 hover:border-foreground/30 transition"
							>
								<div className="flex items-baseline gap-3 min-w-0 flex-1">
									<span className="font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</span>
									<div className="min-w-0 flex-1">
										<div className="text-sm font-medium truncate">{o.name}</div>
										<div className="text-[10px] text-muted-foreground">
											{o.events_count} event{o.events_count === 1 ? "" : "s"}
										</div>
									</div>
								</div>
								<span className="font-mono text-sm tabular-nums shrink-0">{formatGbp(o.revenue_cents)}</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function PipelineFunnelCard({ counts }) {
	// The "funnel" follows the happy path: pending → approved → confirmed → completed.
	// Each step shows count + the % conversion from the previous step.
	const steps = [
		{ key: "pending", label: "Pending", tone: "amber" },
		{ key: "approved", label: "Approved", tone: "primary" },
		{ key: "confirmed", label: "Confirmed", tone: "primary" },
		{ key: "completed", label: "Completed", tone: "primary" },
	];
	const total = steps.reduce((s, st) => s + (counts[st.key] || 0), 0)
		+ (counts.rejected || 0)
		+ (counts.cancelled || 0);
	const maxCount = Math.max(1, ...steps.map((s) => counts[s.key] || 0));
	return (
		<section className="rounded-xl border bg-card p-5 space-y-3">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					Booking pipeline · last 3 months
				</h2>
				<Link href="/admin/bookings" className="text-xs text-muted-foreground hover:text-foreground">
					All bookings →
				</Link>
			</div>
			{total === 0 ? (
				<p className="text-sm text-muted-foreground">No bookings in the last 3 months.</p>
			) : (
				<>
					<ul className="space-y-2">
						{steps.map((s, i) => {
							const count = counts[s.key] || 0;
							const widthPct = Math.round((count / maxCount) * 100);
							const prevCount = i === 0 ? null : counts[steps[i - 1].key] || 0;
							const conv = prevCount && prevCount > 0 ? Math.round((count / prevCount) * 100) : null;
							const barTone = s.tone === "amber"
								? "bg-amber-500/30 border-amber-500/50"
								: "bg-primary/20 border-primary/40";
							return (
								<li key={s.key} className="space-y-1">
									<div className="flex items-baseline justify-between gap-3 text-xs">
										<span className="text-muted-foreground">{s.label}</span>
										<span className="flex items-baseline gap-2">
											{conv != null && <span className="text-[10px] text-muted-foreground">{conv}%</span>}
											<span className="font-mono tabular-nums font-medium">{count}</span>
										</span>
									</div>
									<div className="h-2 rounded-full bg-foreground/5 overflow-hidden">
										<div
											className={`h-full rounded-full border ${barTone}`}
											style={{ width: `${Math.max(2, widthPct)}%` }}
										/>
									</div>
								</li>
							);
						})}
					</ul>
					{(counts.rejected > 0 || counts.cancelled > 0) && (
						<div className="flex gap-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground pt-2 border-t border-foreground/10">
							{counts.rejected > 0 && (
								<span>
									Rejected <span className="font-mono text-destructive ml-1">{counts.rejected}</span>
								</span>
							)}
							{counts.cancelled > 0 && (
								<span>
									Cancelled <span className="font-mono text-muted-foreground ml-1">{counts.cancelled}</span>
								</span>
							)}
						</div>
					)}
				</>
			)}
		</section>
	);
}

function RecentActivityCard({ items }) {
	const relFmt = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
	function relative(at) {
		const ms = new Date(at).getTime() - Date.now();
		const mins = Math.round(ms / 60000);
		if (Math.abs(mins) < 60) return relFmt.format(mins, "minute");
		const hours = Math.round(mins / 60);
		if (Math.abs(hours) < 24) return relFmt.format(hours, "hour");
		const days = Math.round(hours / 24);
		if (Math.abs(days) < 30) return relFmt.format(days, "day");
		const months = Math.round(days / 30);
		return relFmt.format(months, "month");
	}
	return (
		<section className="rounded-xl border bg-card p-5 space-y-3">
			<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
				Recent activity
			</h2>
			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">Nothing happening yet.</p>
			) : (
				<ul className="space-y-2">
					{items.map((it) => {
						const isOrder = it.kind === "order";
						const href = isOrder
							? `/admin/events`
							: `/admin/bookings/${it.subject_id}`;
						const actor =
							it.first_name || it.last_name
								? `${it.first_name ?? ""} ${it.last_name ?? ""}`.trim()
								: null;
						return (
							<li key={`${it.kind}-${it.id}`}>
								<Link
									href={href}
									className="flex items-baseline justify-between gap-3 rounded-md border border-foreground/10 bg-background px-3 py-2 hover:border-foreground/30 transition"
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-baseline gap-2 flex-wrap text-xs">
											<span
												className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${
													isOrder
														? "border-primary/30 bg-primary/10 text-primary"
														: it.to_status === "rejected" || it.to_status === "cancelled"
															? "border-destructive/30 bg-destructive/10 text-destructive"
															: it.to_status === "pending"
																? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
																: "border-foreground/15 bg-muted text-muted-foreground"
												}`}
											>
												{isOrder ? "Order paid" : it.to_status}
											</span>
											<span className="font-mono text-[10px] text-muted-foreground">{it.subject_ref}</span>
											{actor && <span className="truncate">{actor}</span>}
										</div>
										{it.detail && !isOrder && (
											<div className="text-[10px] text-muted-foreground truncate mt-0.5">{it.detail}</div>
										)}
										{isOrder && it.detail && (
											<div className="text-[10px] text-muted-foreground truncate mt-0.5">{it.detail}</div>
										)}
									</div>
									<span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
										{relative(it.occurred_at)}
									</span>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

function StatCard({ label, value, sub, tone = "default", href }) {
	const toneClass =
		tone === "primary"
			? "border-primary/30 bg-primary/5"
			: tone === "amber"
				? "border-amber-500/30 bg-amber-500/5"
				: tone === "destructive"
					? "border-destructive/30 bg-destructive/5"
					: tone === "muted"
						? "border-foreground/10 bg-card"
						: "border-foreground/10 bg-card";
	const Wrapper = href ? Link : "div";
	const wrapperProps = href ? { href } : {};
	return (
		<Wrapper
			{...wrapperProps}
			className={`rounded-xl border p-4 space-y-1.5 ${toneClass} ${href ? "hover:border-foreground/30 transition" : ""}`}
		>
			<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
				{label}
			</div>
			<div className="font-display text-2xl tracking-tight">{value}</div>
			{sub && <div className="text-xs text-muted-foreground">{sub}</div>}
		</Wrapper>
	);
}

function WaterfallSection({ pnl }) {
	const tenancyHasSplit =
		pnl.income.tenancy !== pnl.income.tenancy_paid &&
		pnl.income.tenancy_paid !== undefined;
	const incomeBreakdown = [
		{ label: "Tickets", value: pnl.income.tickets },
		{ label: "Bookings", value: pnl.income.bookings },
		{ label: "POS (net)", value: pnl.income.pos_net },
		{ label: "Manual / other", value: pnl.income.manual },
		{
			label: "Rental (tenancies)",
			value: pnl.income.tenancy,
			sub: tenancyHasSplit
				? `${formatGbp(pnl.income.tenancy_paid ?? 0)} paid`
				: null,
		},
	].filter((r) => r.value !== 0);

	const codBreakdown = [
		{ label: "Expenses", value: pnl.cost_of_delivery_breakdown.expenses },
		{ label: "POS COGS", value: pnl.cost_of_delivery_breakdown.pos_cogs },
		{ label: "Owed to organisers", value: pnl.cost_of_delivery_breakdown.organiser_payouts },
	].filter((r) => r.value !== 0);

	const afterCod = pnl.income.total - pnl.cost_of_delivery;
	const businessNet = afterCod - pnl.fixed.staff;
	const buildingNet = businessNet - pnl.cost_of_building;
	const ministryNet = buildingNet - pnl.fixed.mortgage_extra;

	const staffBreakdown = pnl.fixed.staff !== 0
		? [{ label: "Staff", value: pnl.fixed.staff }]
		: [];
	const buildingBreakdown = [
		{ label: "Utilities", value: pnl.fixed.utilities },
		{ label: "Mortgage", value: pnl.fixed.mortgage },
	].filter((r) => r.value !== 0);
	const extraBreakdown = pnl.fixed.mortgage_extra !== 0
		? [{ label: "Extra mortgage", value: pnl.fixed.mortgage_extra }]
		: [];

	const toneFor = (n) => (n >= 0 ? "primary" : "destructive");

	const steps = [
		{
			label: "Income",
			running: pnl.income.total,
			breakdown: incomeBreakdown,
			tone: toneFor(pnl.income.total),
		},
		{
			label: "Business Net",
			subLabel: "A/ Cost of delivery",
			running: afterCod,
			deduction: pnl.cost_of_delivery,
			breakdown: codBreakdown,
			tone: toneFor(afterCod),
		},
		{
			label: "Business Profit",
			subLabel: "Transfer to church",
			running: businessNet,
			deduction: pnl.fixed.staff,
			breakdown: staffBreakdown,
			tone: toneFor(businessNet),
			highlight: true,
		},
		{
			label: "Building Gross",
			subLabel: "A/ Building costs",
			running: buildingNet,
			deduction: pnl.cost_of_building,
			breakdown: buildingBreakdown,
			tone: toneFor(buildingNet),
		},
		{
			label: "Ministry Gross",
			subLabel: "A/ Extra mortgage",
			running: ministryNet,
			deduction: pnl.fixed.mortgage_extra,
			breakdown: extraBreakdown,
			tone: toneFor(ministryNet),
			highlight: true,
		},
	];

	return (
		<section className="space-y-3">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					This month
				</h2>
				<Link
					href="/admin/ledger"
					className="text-xs text-muted-foreground hover:text-foreground"
				>
					Open ledger →
				</Link>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				{steps.map((s, i) => (
					<WaterfallBox key={s.label} step={s} index={i} />
				))}
			</div>
		</section>
	);
}

function WaterfallBox({ step }) {
	const toneClass =
		step.tone === "primary"
			? "border-primary/30 bg-primary/5"
			: step.tone === "destructive"
				? "border-destructive/30 bg-destructive/5"
				: step.tone === "muted"
					? "border-foreground/10 bg-card"
					: "border-foreground/10 bg-card";
	const valueClass =
		step.tone === "primary"
			? "text-primary"
			: step.tone === "destructive"
				? "text-destructive"
				: step.tone === "muted"
					? "text-muted-foreground"
					: "";
	return (
		<div
			className={`rounded-xl border p-4 flex flex-col gap-1.5 ${toneClass} ${step.highlight ? "ring-1 ring-primary/20" : ""}`}
		>
			<div className="min-h-12">
				<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground leading-tight min-h-8">
					{step.label}
				</div>
				<div className="text-[10px] uppercase tracking-[0.18em] text-primary leading-tight mt-0.5">
					{step.subLabel ?? " "}
				</div>
			</div>
			<div
				className={`font-mono tabular-nums text-2xl ${valueClass} ${step.highlight ? "font-medium" : ""}`}
			>
				{formatGbp(step.running)}
			</div>
			<div className="flex-1 min-h-0">
				{step.breakdown && step.breakdown.length > 0 && (
					<ul className="text-[11px] text-muted-foreground space-y-0.5">
						{step.breakdown.map((b) => (
							<li
								key={b.label}
								className="flex items-baseline justify-between gap-2"
							>
								<span className="truncate">
									{b.label}
									{b.sub && (
										<span className="block text-[10px] text-muted-foreground/70 truncate">
											{b.sub}
										</span>
									)}
								</span>
								<span className="font-mono shrink-0">{formatGbp(b.value)}</span>
							</li>
						))}
					</ul>
				)}
			</div>
			{step.hideDeduction ? null : step.deduction != null ? (
				<div className="flex items-baseline justify-between gap-2 pt-2 border-t border-foreground/10">
					<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Deducted
					</span>
					<span className="font-mono text-xs text-muted-foreground">
						−{formatGbp(step.deduction)}
					</span>
				</div>
			) : (
				<div className="pt-2 border-t border-foreground/10 text-xs invisible">-</div>
			)}
		</div>
	);
}

function combineScheduleItems(segments, blockouts, tenancySessions, todayKey, todayOnly) {
	const items = [];
	for (const s of segments) {
		const startsAt = new Date(s.starts_at);
		const key = londonDayKey(startsAt);
		if (todayOnly && key !== todayKey) continue;
		items.push({
			id: `seg-${s.segment_id}`,
			kind: "booking",
			day_key: key,
			starts_at: startsAt,
			ends_at: new Date(s.ends_at),
			room_name: s.room_name,
			label: s.booking_reference,
			href: `/admin/bookings/${s.booking_id}`,
			status: s.booking_status,
		});
	}
	for (const ts of tenancySessions ?? []) {
		const startsAt = new Date(ts.starts_at);
		const key = londonDayKey(startsAt);
		if (todayOnly && key !== todayKey) continue;
		items.push({
			id: `tenancy-${ts.id}`,
			kind: "tenancy",
			day_key: key,
			starts_at: startsAt,
			ends_at: new Date(ts.ends_at),
			room_name: ts.room_name,
			label: ts.tenancy_label || ts.organisation_name || "Tenancy",
			href: `/admin/tenancies/${ts.tenancy_id}`,
			status: "scheduled",
		});
	}
	// `listBlockoutsInRange` returns one row per (blockout × room ×
	// expanded occurrence). The dashboard widget treats a single blockout
	// occurrence as ONE schedule entry — so we group the per-room rows
	// back together and present the rooms as a comma-separated list. The
	// grouping key is the blockout id + occurrence start, which is unique
	// across the expansion.
	const blockoutGroups = new Map();
	for (const b of blockouts) {
		const startsAt = new Date(b.starts_at);
		const key = londonDayKey(startsAt);
		if (todayOnly && key !== todayKey) continue;
		const groupKey = `${b.id}-${startsAt.getTime()}`;
		let group = blockoutGroups.get(groupKey);
		if (!group) {
			group = {
				id: `blk-${groupKey}`,
				kind: "blockout",
				day_key: key,
				starts_at: startsAt,
				ends_at: new Date(b.ends_at),
				rooms: [],
				label: b.reason,
				href: "/admin/blockouts",
				status: b.is_public ? "public" : "private",
			};
			blockoutGroups.set(groupKey, group);
		}
		group.rooms.push(b.room_name ?? "All rooms");
	}
	for (const group of blockoutGroups.values()) {
		const rooms = group.rooms;
		const roomLabel =
			rooms.length === 0
				? "All rooms"
				: rooms.length <= 3
					? rooms.join(", ")
					: `${rooms.slice(0, 2).join(", ")} +${rooms.length - 2} more`;
		items.push({
			...group,
			room_name: roomLabel,
			room_count: rooms.length,
		});
	}
	items.sort((a, b) => a.starts_at - b.starts_at);
	return items;
}

function ScheduleCard({ title, items, emptyMessage, groupByDay = false }) {
	if (items.length === 0) {
		return (
			<section className="rounded-xl border bg-card p-6 space-y-2">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					{title}
				</h2>
				<p className="text-sm text-muted-foreground">{emptyMessage}</p>
			</section>
		);
	}

	if (!groupByDay) {
		return (
			<section className="rounded-xl border bg-card p-6 space-y-3">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					{title}
				</h2>
				<ul className="space-y-2">
					{items.map((item) => (
						<ScheduleItem key={item.id} item={item} />
					))}
				</ul>
			</section>
		);
	}

	const groups = new Map();
	for (const item of items) {
		if (!groups.has(item.day_key)) groups.set(item.day_key, []);
		groups.get(item.day_key).push(item);
	}

	return (
		<section className="rounded-xl border bg-card p-6 space-y-4">
			<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
				{title}
			</h2>
			<div className="space-y-4">
				{[...groups.entries()].map(([dayKey, dayItems]) => (
					<div key={dayKey} className="space-y-1.5">
						<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
							{dayFmt.format(dayItems[0].starts_at)}
						</div>
						<ul className="space-y-1">
							{dayItems.map((item) => (
								<ScheduleItem key={item.id} item={item} />
							))}
						</ul>
					</div>
				))}
			</div>
		</section>
	);
}

function ScheduleItem({ item }) {
	const kindBadge =
		item.kind === "blockout"
			? "border-destructive/30 bg-destructive/10 text-destructive"
			: "border-primary/30 bg-primary/10 text-primary";
	return (
		<li>
			<Link
				href={item.href}
				className="flex items-baseline justify-between gap-3 rounded-md border border-foreground/10 bg-background px-3 py-2 hover:border-foreground/30 transition"
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-baseline gap-2 flex-wrap text-sm">
						<span
							className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${kindBadge}`}
						>
							{item.kind}
						</span>
						<span className="font-mono text-xs text-muted-foreground">
							{timeFmt.format(item.starts_at)}
							{item.ends_at ? `-${timeFmt.format(item.ends_at)}` : ""}
						</span>
						<span className="font-medium truncate">{item.label}</span>
					</div>
					<div className="text-xs text-muted-foreground">{item.room_name}</div>
				</div>
			</Link>
		</li>
	);
}
