import Link from "next/link";
import { cookies } from "next/headers";
import { requireCurrentVenue } from "@/db/queries/venue";
import {
	getCombinedLatestBalance,
	getBankInOutBetween,
	listBankAccounts,
	listBankTransactions,
	listBankBalanceSeries,
} from "@/db/queries/bank";
import { listExpenseCategories, listRecurringCostItems } from "@/db/queries/finance";
import { listOrganisations } from "@/db/queries/crm";
import { RECURRING_COST_TYPES } from "@/db/schema/entities/recurring_cost_schedule";
import { currentMonthLondon, resolveMonth, monthLabel } from "@/lib/finance/months";
import BalanceChart from "./_components/balance-chart";
import AccountPills from "./_components/account-pills";
import SyncNowButton from "./_components/sync-now-button";
import MatchCell from "./_components/match-cell";
import PspIncomeToggle from "./_components/psp-income-toggle";

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
	// User preference lives in a cookie (no URL param, no scroll jump
	// when toggled). Defaults to hidden.
	const cookieStore = await cookies();
	const showPspIncome = cookieStore.get("psp_income_shown")?.value === "1";

	const venue = await requireCurrentVenue();
	const accounts = await listBankAccounts(venue.id);
	const allowedIds = accounts.map((a) => a.id);
	const accountIds = parseAccountFilter(sp?.accounts, allowedIds);

	const month = resolveMonth(currentMonthLondon().ym);

	// Drill-down filters from the recurring page: ?recurring=<item_id>
	// scopes the transaction list to bank rows linked to that item, and
	// ?period=YYYY-MM clips them to that month. Used by the click-through
	// from "actual this month".
	const recurringFilterId = typeof sp?.recurring === "string" ? sp.recurring : null;
	const periodFilter =
		typeof sp?.period === "string" && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : null;
	let periodStartIso = null;
	let periodEndIso = null;
	if (periodFilter) {
		const filtered = resolveMonth(periodFilter);
		periodStartIso = filtered.monthStartDate.toISOString();
		periodEndIso = filtered.monthEndDate.toISOString();
	}

	const [combined, inOut, txPage, daily, weekly, monthly, categories, recurringItems, organisations] = await Promise.all([
		getCombinedLatestBalance(venue.id, { accountIds }),
		getBankInOutBetween(venue.id, month.monthStartDate, month.monthEndDate, { accountIds }),
		listBankTransactions(venue.id, {
			limit: PAGE_SIZE,
			offset,
			accountIds,
			showPspIncome,
			matchedRecurringItemId: recurringFilterId,
			periodStartIso,
			periodEndIso,
		}),
		listBankBalanceSeries(venue.id, { bucket: "day", accountIds }),
		listBankBalanceSeries(venue.id, { bucket: "week", accountIds }),
		listBankBalanceSeries(venue.id, { bucket: "month", accountIds }),
		listExpenseCategories(venue.id),
		listRecurringCostItems(venue.id),
		listOrganisations(venue.id),
	]);

	// Pre-shape the recurring items into [{ type, label, items: [...] }, ...]
	// so the dialog doesn't have to redo the grouping client-side.
	const RECURRING_TYPE_LABELS = {
		utilities: "Utilities",
		staff: "Staff",
		mortgage: "Mortgage",
		mortgage_extra: "Extra mortgage payments",
	};
	const recurringGroups = RECURRING_COST_TYPES.map((type) => ({
		type,
		label: RECURRING_TYPE_LABELS[type] ?? type,
		items: recurringItems
			.filter((i) => i.type === type)
			.map((i) => ({ id: i.id, label: i.label })),
	})).filter((g) => g.items.length > 0);

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
					<div className="flex items-center gap-3 flex-wrap">
						<div className="text-xs text-muted-foreground">
							{accounts.length} account{accounts.length === 1 ? "" : "s"} connected
							{latestSyncedAt ? <> · Last synced {stampFmt.format(new Date(latestSyncedAt))}</> : null}
						</div>
						{!noAccountsConnected && <SyncNowButton />}
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
							<div className="flex items-center gap-3 text-xs text-muted-foreground">
								<PspIncomeToggle initial={showPspIncome} />
								<span>
									{txPage.total} total · page {page} of {totalPages}
								</span>
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
							<TransactionsTable
								rows={txPage.rows}
								accountsById={Object.fromEntries(accounts.map((a) => [a.id, a]))}
								categories={categories}
								recurringGroups={recurringGroups}
								organisations={organisations.map((o) => ({ id: o.id, name: o.name }))}
							/>
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
	const effective = combined?.effective_minor ?? cleared;
	const pending = combined?.pending_minor ?? 0;
	const inMinor = inOut?.in_minor ?? 0;
	const outMinor = inOut?.out_minor ?? 0;
	const net = inOut?.net_minor ?? 0;
	return (
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<Card
				label="Balance"
				value={fmtMinor(effective)}
				tone="primary"
				sub={combined ? `Across ${combined.account_count} account${combined.account_count === 1 ? "" : "s"} · ${stampFmt.format(new Date(combined.captured_at))}` : "-"}
				footer={
					pending !== 0 ? (
						<>
							<span className="font-mono tabular-nums">{fmtMinor(cleared)}</span> cleared ·{" "}
							<span className="font-mono tabular-nums">{`${pending >= 0 ? "+" : "−"}${fmtMinor(Math.abs(pending))}`}</span> pending
						</>
					) : (
						<><span className="font-mono tabular-nums">{fmtMinor(cleared)}</span> cleared</>
					)
				}
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

function Card({ label, value, sub, footer, tone = "default" }) {
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
			{footer && <div className="text-[11px] text-muted-foreground pt-1">{footer}</div>}
		</div>
	);
}

function TransactionsTable({ rows, accountsById, categories, recurringGroups, organisations }) {
	const now = Date.now();
	return (
		// `overflow-x-auto` lets the table scroll horizontally on narrower
		// viewports rather than clipping the amount column off the right
		// edge. `table-fixed` plus explicit column widths in the colgroup
		// force the counterparty + reference columns to stay capped so
		// the truncation actually kicks in.
		<div className="rounded-xl border bg-card overflow-x-auto">
			<table className="w-full text-sm table-fixed">
				<colgroup>
					<col className="w-27.5" />
					<col className="w-35" />
					<col className="w-65" />
					<col className="w-50" />
					<col className="w-50" />
					<col className="w-30" />
				</colgroup>
				<thead className="bg-muted/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					<tr>
						<th className="text-left px-4 py-2">Date</th>
						<th className="text-left px-4 py-2">Account</th>
						<th className="text-left px-4 py-2">Counterparty</th>
						<th className="text-left px-4 py-2">Reference</th>
						<th className="text-left px-4 py-2">Match</th>
						<th className="text-right px-4 py-2">Amount</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-foreground/5">
					{rows.map((r) => {
						// Show when the payment happened, not when it cleared - Stripe
						// charges sit on `available_on` (settled_at) days in the future
						// before becoming payable.
						const when = r.transaction_time ?? r.settled_at;
						const dateStr = when ? dateFmt.format(new Date(when)) : "-";
						// Pending = the source hasn't filled in settled_at at all.
						// Bank rails (Monzo, Starling) post settled_at the moment a
						// transfer lands even if it's a few seconds ahead of "now",
						// so a future settled_at is fine. Only Stripe genuinely sits
						// "pending" against an `available_on` date — and there the
						// settled_at value still represents real settlement.
						const settledMs = r.settled_at ? new Date(r.settled_at).getTime() : null;
						const isPending = settledMs == null;
						const isIn = r.direction === "IN";
						const accountLabel = accountsById[r.bank_account_id]?.label ?? "-";
						// Synthetic PSP fee rows (Stripe + Square) ride along with
						// their parent payment via external_id `${parent.id}#fee`.
						// Render them as a visually nested child of the row above.
						const isFee =
							(r.source === "stripe" || r.source === "square") &&
							typeof r.external_id === "string" &&
							r.external_id.endsWith("#fee");
						return (
							<tr
								key={r.id}
								className={`hover:bg-muted/20 ${r.is_transfer ? "opacity-60" : ""} ${isFee ? "bg-muted/10" : ""}`}
							>
								<td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
									{isFee ? "" : dateStr}
								</td>
								<td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
									{isFee ? "" : accountLabel}
								</td>
								<td className="px-4 py-2.5 max-w-xs">
									<div className="flex items-baseline gap-2 min-w-0">
										{isFee && (
											<span
												aria-hidden
												className="inline-block w-3 h-3 border-l border-b border-muted-foreground/40 ml-1 mr-1 self-center -translate-y-0.75 shrink-0"
											/>
										)}
										<span className={`truncate ${isFee ? "text-muted-foreground text-xs" : ""}`}>
											{r.counterparty_name || "-"}
										</span>
										{isPending && !r.is_transfer && !isFee && (
											<span className="text-[10px] uppercase tracking-[0.15em] text-amber-700 dark:text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded-full px-1.5 py-0.5 shrink-0">
												Pending
											</span>
										)}
									</div>
								</td>
								<td className={`px-4 py-2.5 text-muted-foreground truncate max-w-xs ${isFee ? "text-xs" : ""}`}>
									{r.reference || ""}
								</td>
								<td className="px-4 py-2.5 whitespace-nowrap">
									{r.source === "square" && r.direction === "IN" ? (
										// Square incoming: no order/booking is ingested for
										// it on our side, so there's nothing to match against
										// — dash it rather than implying it's actionable.
										<span className="text-muted-foreground/60 text-xs">—</span>
									) : (
										<MatchCell
											transactionId={r.id}
											direction={r.direction}
											isTransfer={r.is_transfer}
											isFee={isFee}
											isChurchTransfer={r.is_church_transfer}
											matchedToType={r.matched_to_type}
											matchedReference={r.matched_invoice_reference}
											matchedInvoiceStatus={r.matched_invoice_status}
											matchedExpenseKind={r.matched_expense_kind}
											matchedExpenseCategory={r.matched_expense_category}
											matchedRecurringType={r.matched_recurring_type}
											matchedRecurringLabel={r.matched_recurring_label}
											matchedManualInvoiceReference={r.matched_manual_invoice_reference}
											matchedManualInvoiceId={r.matched_manual_invoice_id}
											matchedBookingPaymentLabel={r.matched_booking_payment_label}
											matchedBookingPaymentDeleted={r.matched_booking_payment_deleted}
											matchedBookingReference={r.matched_booking_reference}
											matchedBookingId={r.matched_booking_id}
											matchedBookingDeleted={r.matched_booking_deleted}
											matchedTicketOrderReference={r.matched_ticket_order_reference}
											matchedTicketOrderEventId={r.matched_ticket_order_event_id}
											matchedTicketOrderDeleted={r.matched_ticket_order_deleted}
											matchedOrphanReference={r.matched_orphan_reference}
											transaction={r}
											categories={categories}
											recurringGroups={recurringGroups}
											organisations={organisations}
										/>
									)}
								</td>
								<td
									className={`px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap ${
										isIn ? "text-primary" : "text-destructive"
									} ${isFee ? "text-xs" : ""}`}
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
