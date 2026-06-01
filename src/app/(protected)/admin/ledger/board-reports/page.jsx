import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import {
	getBoardReportHistory,
} from "@/db/queries/settings";
import { listStaffUsersSubscribedTo } from "@/db/queries/staff-notifications";
import { currentMonthLondon, monthLabel } from "@/lib/finance/months";
import SendNowButton from "./_components/send-now-button";

export const dynamic = "force-dynamic";

// First month covered by the board pack. Earlier months either had no
// venue activity or pre-date the platform.
const FIRST_YEAR = 2026;
const FIRST_MONTH = 5;

function pad(n) {
	return String(n).padStart(2, "0");
}

function listMonthsBetween(startY, startM, endY, endM) {
	const out = [];
	let y = startY;
	let m = startM;
	while (y < endY || (y === endY && m <= endM)) {
		out.push({ year: y, month1: m, ym: `${y}-${pad(m)}` });
		m += 1;
		if (m > 12) {
			m = 1;
			y += 1;
		}
	}
	return out;
}

const sentDateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});

export default async function BoardReportsPage() {
	const venue = await requireCurrentVenue();
	const [recipients, history] = await Promise.all([
		listStaffUsersSubscribedTo("monthly-board-pack"),
		getBoardReportHistory(venue.id),
	]);
	const sentByYm = new Map(
		(history.sent ?? []).map((s) => [s.ym, s]),
	);

	const current = currentMonthLondon();
	const months = listMonthsBetween(FIRST_YEAR, FIRST_MONTH, current.year, current.month1)
		.reverse();

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-4xl space-y-10">
			<div>
				<h1 className="text-2xl font-semibold">Board reports</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Monthly board pack PDFs and the recipients the cron emails them to.
				</p>
			</div>

			<section className="space-y-3">
				<div className="flex items-baseline justify-between gap-3 flex-wrap">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						Monthly reports
					</h2>
					<span className="text-xs text-muted-foreground">
						{months.length} month{months.length === 1 ? "" : "s"}
					</span>
				</div>
				<ul className="rounded-lg border bg-card divide-y divide-foreground/10 overflow-hidden">
					{months.map((m) => {
						const sent = sentByYm.get(m.ym);
						return (
							<li
								key={m.ym}
								className="flex items-baseline justify-between gap-3 px-4 py-3"
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-baseline gap-2 flex-wrap">
										<span className="text-sm font-medium">
											{monthLabel(m.year, m.month1)}
										</span>
										{sent && (
											<span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] uppercase tracking-[0.15em] px-2 py-0.5">
												Sent
											</span>
										)}
									</div>
									<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
										{m.ym}
										{sent && (
											<>
												{" "}· {sentDateFmt.format(new Date(sent.at))} ·{" "}
												{sent.emails_sent ?? sent.recipients_count ?? 0} sent
												{sent.emails_failed > 0 ? `, ${sent.emails_failed} failed` : ""}
											</>
										)}
									</div>
								</div>
								<div className="flex items-center gap-2 shrink-0">
									<Link
										href={`/admin/ledger/board-pack?month=${m.ym}`}
										className="rounded-md border border-foreground/15 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30"
									>
										Download PDF
									</Link>
									<SendNowButton ym={m.ym} isResend={!!sent} />
								</div>
							</li>
						);
					})}
				</ul>
			</section>

			<section className="space-y-3">
				<div className="flex items-baseline justify-between gap-3 flex-wrap">
					<div>
						<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
							Email recipients
						</h2>
						<p className="text-xs text-muted-foreground mt-1 max-w-prose">
							The monthly cron sends to every admin user who has{" "}
							<strong>Monthly board pack</strong> ticked on{" "}
							<Link href="/admin/users" className="underline hover:text-foreground">
								Users
							</Link>.
						</p>
					</div>
					<Link
						href="/admin/users"
						className="text-xs text-muted-foreground hover:text-foreground underline"
					>
						Manage in Users →
					</Link>
				</div>
				{recipients.length === 0 ? (
					<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
						No admin users are subscribed yet. Open Users and tick the box for
						anyone who should receive the monthly pack.
					</div>
				) : (
					<ul className="rounded-lg border bg-card divide-y divide-foreground/10">
						{recipients.map((r) => (
							<li key={r.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
								<div>
									<div className="text-sm font-medium">
										{`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "—"}
									</div>
									<div className="text-xs text-muted-foreground">{r.email}</div>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
