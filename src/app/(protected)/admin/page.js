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
import { getLatestBalanceSnapshot, getBankInOutBetween } from "@/db/queries/bank";
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
		dayActivity,
		monthlyTrend,
		upcomingEvents,
		bankSnapshot,
		bankInOut,
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
		listDayActivityForMonth(venue.id, month.monthStartDate, month.monthEndDate),
		listMonthlyPnlForRange(venue.id, { endYm: month.ym, monthsBack: 12 }),
		listUpcomingEvents(venue.id, { limit: 10 }),
		getLatestBalanceSnapshot(venue.id),
		getBankInOutBetween(venue.id, month.monthStartDate, month.monthEndDate),
	]);

	const todayItems = combineScheduleItems(segments, blockouts, todayKey, true);
	const weekItems = combineScheduleItems(segments, blockouts, todayKey, false);

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

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<PendingBookingsWidget bookings={pendingBookings} />
				<PendingEventsWidget events={pendingEvents} />
				<StatCard
					label="Outstanding balances"
					value={formatGbp(outstandingCents)}
					tone={outstandingCents > 0 ? "default" : "muted"}
					href="/admin/bookings"
					sub="Across approved & confirmed bookings"
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
						Bank balance
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
	const incomeBreakdown = [
		{ label: "Tickets", value: pnl.income.tickets },
		{ label: "Bookings", value: pnl.income.bookings },
		{ label: "POS (net)", value: pnl.income.pos_net },
		{ label: "Manual / other", value: pnl.income.manual },
	].filter((r) => r.value !== 0);

	const codBreakdown = [
		{ label: "Expenses", value: pnl.cost_of_delivery_breakdown.expenses },
		{ label: "POS COGS", value: pnl.cost_of_delivery_breakdown.pos_cogs },
		{ label: "Owed to organisers", value: pnl.cost_of_delivery_breakdown.organiser_payouts },
		{ label: "Stripe fees", value: pnl.cost_of_delivery_breakdown.stripe_fees },
	].filter((r) => r.value !== 0);

	const staffAndUtilities = pnl.fixed.utilities + pnl.fixed.staff;
	const afterCod = pnl.income.total - pnl.cost_of_delivery;
	const afterStaffAndUtilities = afterCod - staffAndUtilities;
	const afterMortgage = afterStaffAndUtilities - pnl.fixed.mortgage;
	const ministryGift = afterMortgage - pnl.fixed.mortgage_extra;

	const staffUtilBreakdown = [
		{ label: "Utilities", value: pnl.fixed.utilities },
		{ label: "Staff", value: pnl.fixed.staff },
	].filter((r) => r.value !== 0);

	const steps = [
		{
			label: "Income",
			running: pnl.income.total,
			breakdown: incomeBreakdown,
			tone: pnl.income.total > 0 ? "primary" : "muted",
		},
		{
			label: "A/ Cost of Delivery",
			running: afterCod,
			deduction: pnl.cost_of_delivery,
			breakdown: codBreakdown,
		},
		{
			label: "A/ Staff & Utilities",
			running: afterStaffAndUtilities,
			deduction: staffAndUtilities,
			breakdown: staffUtilBreakdown,
		},
		{
			label: "A/ Mortgage",
			running: afterMortgage,
			deduction: pnl.fixed.mortgage,
		},
		{
			label: "A/ Extra Mortgage",
			subLabel: "Ministry gift",
			running: ministryGift,
			deduction: pnl.fixed.mortgage_extra,
			hideDeduction: true,
			tone: ministryGift >= 0 ? "primary" : "destructive",
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
								<span className="truncate">{b.label}</span>
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
				<div className="pt-2 border-t border-foreground/10 text-xs invisible">—</div>
			)}
		</div>
	);
}

function combineScheduleItems(segments, blockouts, todayKey, todayOnly) {
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
	for (const b of blockouts) {
		const startsAt = new Date(b.starts_at);
		const key = londonDayKey(startsAt);
		if (todayOnly && key !== todayKey) continue;
		items.push({
			id: `blk-${b.id}`,
			kind: "blockout",
			day_key: key,
			starts_at: startsAt,
			ends_at: new Date(b.ends_at),
			room_name: b.room_name ?? "All rooms",
			label: b.reason,
			href: "/admin/blockouts",
			status: b.is_public ? "public" : "private",
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
							{item.ends_at ? `–${timeFmt.format(item.ends_at)}` : ""}
						</span>
						<span className="font-medium truncate">{item.label}</span>
					</div>
					<div className="text-xs text-muted-foreground">{item.room_name}</div>
				</div>
			</Link>
		</li>
	);
}
