import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import {
	getCombinedLatestBalance,
	getBankInOutBetween,
	listBankAccounts,
	listBankTransactions,
	listBankBalanceSeries,
} from "@/db/queries/bank";
import { currentMonthLondon, resolveMonth, monthLabel } from "@/lib/finance/months";
import BalanceChart from "./_components/balance-chart";
import AccountPills from "./_components/account-pills";
import ChurchTransferToggle from "./_components/church-transfer-toggle";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const stampFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtMinor = (m) => gbp.format((m ?? 0) / 100);

function parseAccountFilter(raw, allowedIds) {
	if (typeof raw !== "string" || raw === "") return null;
	const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
	const allowed = new Set(allowedIds);
	const filtered = ids.filter((id) => allowed.has(id));
	return filtered.length > 0 && filtered.length < allowedIds.length ? filtered : null;
}

export default async function BankingPage({ searchParams }) {
	const sp = await searchParams;
	const page = Math.max(1, Number(sp?.page) || 1);
	const offset = (page - 1) * PAGE_SIZE;

	const venue = await requireCurrentVenue();
	const accounts = await listBankAccounts(venue.id);
	const allowedIds = accounts.map((a) => a.id);
	const accountIds = parseAccountFilter(sp?.accounts, allowedIds);

	const month = resolveMonth(currentMonthLondon().ym);

	const [combined, inOut, txPage, daily, weekly, monthly] = await Promise.all([
		getCombinedLatestBalance(venue.id, { accountIds }),
		getBankInOutBetween(venue.id, month.monthStartDate, month.monthEndDate, { accountIds }),
		listBankTransactions(venue.id, { limit: PAGE_SIZE, offset, accountIds }),
		listBankBalanceSeries(venue.id, { bucket: "day", accountIds }),
		listBankBalanceSeries(venue.id, { bucket: "week", accountIds }),
		listBankBalanceSeries(venue.id, { bucket: "month", accountIds }),
	]);

	const totalPages = Math.max(1, Math.ceil(txPage.total / PAGE_SIZE));
	const noAccountsConnected = accounts.length === 0;
	const latestSyncedAt = accounts
		.map((a) => a.last_synced_at)
		.filter(Boolean)
		.sort()
		.pop();

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-6xl space-y-8">
			<div>
				<Link
					href="/admin/ledger/overview"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Ledger
				</Link>
				<div className="mt-2 flex items-baseline justify-between gap-3 flex-wrap">
					<h1 className="text-2xl font-semibold">Banking</h1>
					<div className="text-xs text-muted-foreground">
						{accounts.length} account{accounts.length === 1 ? "" : "s"} connected
						{latestSyncedAt ? <> · Last synced {stampFmt.format(new Date(latestSyncedAt))}</> : null}
					</div>
				</div>
			</div>

			{noAccountsConnected ? (
				<div className="rounded-xl border bg-card p-10 text-center space-y-4">
					<h2 className="font-display text-2xl tracking-tight">No bank accounts connected.</h2>
					<p className="text-muted-foreground max-w-md mx-auto">
						Connect one or more bank accounts to see balance, transactions, and
						a daily history chart here.
					</p>
					<Link
						href="/admin/settings/bank-accounts"
						className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 transition"
					>
						Connect a bank account →
					</Link>
				</div>
			) : (
				<>
					<AccountPills accounts={accounts} selectedIds={accountIds} />

					<HeadlineCards
						combined={combined}
						inOut={inOut}
						monthName={monthLabel(month.year, month.month1)}
					/>

					<BalanceChart series={{ day: daily, week: weekly, month: monthly }} />

					<section className="space-y-3">
						<div className="flex items-baseline justify-between gap-3 flex-wrap">
							<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
								Transactions
							</h2>
							<div className="text-xs text-muted-foreground">
								{txPage.total} total · page {page} of {totalPages}
							</div>
						</div>
						{txPage.rows.length === 0 ? (
							<p className="text-sm text-muted-foreground rounded-xl border bg-card p-6">
								No transactions yet. Hit &ldquo;Sync&rdquo; in{" "}
								<Link href="/admin/settings/bank-accounts" className="hover:text-foreground">
									Settings → Bank accounts
								</Link>{" "}
								to pull the latest.
							</p>
						) : (
							<TransactionsTable rows={txPage.rows} accountsById={Object.fromEntries(accounts.map((a) => [a.id, a]))} />
						)}
						{totalPages > 1 && (
							<Pagination page={page} totalPages={totalPages} sp={sp} />
						)}
					</section>
				</>
			)}
		</div>
	);
}

function HeadlineCards({ combined, inOut, monthName }) {
	const cleared = combined?.cleared_minor ?? 0;
	const inMinor = inOut?.in_minor ?? 0;
	const outMinor = inOut?.out_minor ?? 0;
	const net = inOut?.net_minor ?? 0;
	return (
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<Card
				label="Cleared balance"
				value={fmtMinor(cleared)}
				tone="primary"
				sub={combined ? `Across ${combined.account_count} account${combined.account_count === 1 ? "" : "s"} · ${stampFmt.format(new Date(combined.captured_at))}` : "-"}
			/>
			<Card label={`In · ${monthName}`} value={`+${fmtMinor(inMinor)}`} tone="primary" sub="Settled this month, excluding transfers" />
			<Card label={`Out · ${monthName}`} value={`−${fmtMinor(outMinor)}`} tone="destructive" sub="Settled this month, excluding transfers" />
			<Card
				label={`Net · ${monthName}`}
				value={`${net >= 0 ? "+" : "−"}${fmtMinor(Math.abs(net))}`}
				tone={net >= 0 ? "primary" : "destructive"}
				sub="In minus out"
			/>
		</div>
	);
}

function Card({ label, value, sub, tone = "default" }) {
	const toneClass =
		tone === "primary"
			? "border-primary/30 bg-primary/5"
			: tone === "destructive"
				? "border-destructive/30 bg-destructive/5"
				: "border-foreground/10 bg-card";
	const valueClass =
		tone === "primary" ? "text-primary" : tone === "destructive" ? "text-destructive" : "";
	return (
		<div className={`rounded-xl border p-5 space-y-1.5 ${toneClass}`}>
			<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
			<div className={`font-display text-2xl tracking-tight ${valueClass}`}>{value}</div>
			{sub && <div className="text-xs text-muted-foreground">{sub}</div>}
		</div>
	);
}

function TransactionsTable({ rows, accountsById }) {
	return (
		<div className="rounded-xl border bg-card overflow-hidden">
			<table className="w-full text-sm">
				<thead className="bg-muted/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					<tr>
						<th className="text-left px-4 py-2">Date</th>
						<th className="text-left px-4 py-2">Account</th>
						<th className="text-left px-4 py-2">Counterparty</th>
						<th className="text-left px-4 py-2">Reference</th>
						<th className="text-right px-4 py-2">Amount</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-foreground/5">
					{rows.map((r) => {
						const when = r.settled_at ?? r.transaction_time;
						const dateStr = when ? dateFmt.format(new Date(when)) : "-";
						const isIn = r.direction === "IN";
						const accountLabel = accountsById[r.bank_account_id]?.label ?? "-";
						return (
							<tr key={r.id} className={`hover:bg-muted/20 ${r.is_transfer ? "opacity-60" : ""}`}>
								<td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{dateStr}</td>
								<td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{accountLabel}</td>
								<td className="px-4 py-2.5">
									<div className="flex items-baseline gap-2 flex-wrap">
										<span>{r.counterparty_name || "-"}</span>
										{r.is_transfer && (
											<span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground border border-foreground/15 rounded-full px-1.5 py-0.5">
												Transfer
											</span>
										)}
										{!r.is_transfer && !isIn && (
											<ChurchTransferToggle
												transactionId={r.id}
												initial={r.is_church_transfer}
											/>
										)}
									</div>
								</td>
								<td className="px-4 py-2.5 text-muted-foreground truncate max-w-xs">
									{r.reference || ""}
								</td>
								<td
									className={`px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap ${
										isIn ? "text-primary" : "text-destructive"
									}`}
								>
									{isIn ? "+" : "−"}{fmtMinor(r.amount_minor)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function Pagination({ page, totalPages, sp }) {
	const prev = page > 1 ? page - 1 : null;
	const next = page < totalPages ? page + 1 : null;
	function hrefFor(p) {
		const params = new URLSearchParams();
		if (sp?.accounts) params.set("accounts", sp.accounts);
		params.set("page", String(p));
		return `/admin/ledger/banking?${params}`;
	}
	return (
		<div className="flex items-center justify-between gap-3 pt-2">
			{prev ? (
				<Link href={hrefFor(prev)} className="text-sm text-muted-foreground hover:text-foreground">
					← Newer
				</Link>
			) : (
				<span />
			)}
			<div className="text-xs text-muted-foreground">
				Page {page} / {totalPages}
			</div>
			{next ? (
				<Link href={hrefFor(next)} className="text-sm text-muted-foreground hover:text-foreground">
					Older →
				</Link>
			) : (
				<span />
			)}
		</div>
	);
}
