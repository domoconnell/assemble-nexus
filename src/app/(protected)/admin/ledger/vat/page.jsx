import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getVatReturnRollup } from "@/db/queries/vat";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtCents = (c) => gbp.format((c ?? 0) / 100);

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});

function pad(n) {
	return String(n).padStart(2, "0");
}

function startOfMonth(year, month1) {
	return new Date(Date.UTC(year, month1 - 1, 1, 0, 0, 0, 0));
}

function calendarQuarters(today) {
	const y = today.getUTCFullYear();
	const m = today.getUTCMonth() + 1;
	const currentQ = Math.floor((m - 1) / 3); // 0..3
	const qStartMonth = currentQ * 3 + 1;
	const current = {
		label: `Q${currentQ + 1} ${y}`,
		from: startOfMonth(y, qStartMonth),
		to: startOfMonth(currentQ === 3 ? y + 1 : y, currentQ === 3 ? 1 : qStartMonth + 3),
	};
	const prevQ = currentQ === 0 ? 3 : currentQ - 1;
	const prevYear = currentQ === 0 ? y - 1 : y;
	const previous = {
		label: `Q${prevQ + 1} ${prevYear}`,
		from: startOfMonth(prevYear, prevQ * 3 + 1),
		to: startOfMonth(prevYear, prevQ * 3 + 4) > startOfMonth(prevYear + 1, 1)
			? startOfMonth(prevYear + 1, 1)
			: startOfMonth(prevYear, prevQ * 3 + 4),
	};
	if (prevQ === 3) {
		previous.to = startOfMonth(prevYear + 1, 1);
	}
	return { current, previous };
}

function ymd(d) {
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function parseYmd(s) {
	if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
	const [y, m, d] = s.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export default async function VatPage({ searchParams }) {
	const sp = await searchParams;
	const today = new Date();
	const quarters = calendarQuarters(today);
	const defaultFrom = quarters.previous.from;
	const defaultTo = quarters.previous.to;

	const fromDate = parseYmd(sp?.from) ?? defaultFrom;
	const toDateRaw = parseYmd(sp?.to) ?? defaultTo;
	// `to` is exclusive in the query; if the user picked a date, treat it as
	// inclusive and shift by one day so they see takings ON that date.
	const toDate = sp?.to ? new Date(toDateRaw.getTime() + 24 * 60 * 60 * 1000) : toDateRaw;

	const venue = await requireCurrentVenue();
	const rollup = await getVatReturnRollup(venue.id, { fromDate, toDate });

	const csvHref = `/admin/ledger/vat/export.csv?from=${ymd(fromDate)}&to=${ymd(new Date(toDate.getTime() - 24 * 60 * 60 * 1000))}`;

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div>
				<Link
					href="/admin/ledger/overview"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Ledger
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">VAT return</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Output VAT (VAT charged on sales) rolled up across bookings, ticket
					sales and POS. Cash basis - each stream uses its natural &ldquo;money
					received&rdquo; timestamp.
				</p>
			</div>

			<form
				action="/admin/ledger/vat"
				method="GET"
				className="rounded-lg border bg-card p-5 flex flex-wrap items-end gap-3"
			>
				<div className="flex flex-col gap-1.5">
					<label htmlFor="from" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
						From
					</label>
					<input
						id="from"
						name="from"
						type="date"
						defaultValue={ymd(fromDate)}
						className="rounded-md border bg-background px-3 py-1.5 text-sm"
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<label htmlFor="to" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
						To
					</label>
					<input
						id="to"
						name="to"
						type="date"
						defaultValue={ymd(new Date(toDate.getTime() - 24 * 60 * 60 * 1000))}
						className="rounded-md border bg-background px-3 py-1.5 text-sm"
					/>
				</div>
				<button
					type="submit"
					className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm hover:opacity-90 transition"
				>
					Apply
				</button>
				<div className="flex items-center gap-2 ml-auto">
					<Link
						href={`/admin/ledger/vat?from=${ymd(quarters.previous.from)}&to=${ymd(new Date(quarters.previous.to.getTime() - 24 * 60 * 60 * 1000))}`}
						className="text-xs text-muted-foreground hover:text-foreground rounded-md border px-3 py-1.5"
					>
						{quarters.previous.label}
					</Link>
					<Link
						href={`/admin/ledger/vat?from=${ymd(quarters.current.from)}&to=${ymd(new Date(quarters.current.to.getTime() - 24 * 60 * 60 * 1000))}`}
						className="text-xs text-muted-foreground hover:text-foreground rounded-md border px-3 py-1.5"
					>
						{quarters.current.label}
					</Link>
				</div>
			</form>

			<div className="text-xs text-muted-foreground">
				Showing <span className="text-foreground">{dateFmt.format(fromDate)}</span>{" "}
				to <span className="text-foreground">{dateFmt.format(new Date(toDate.getTime() - 24 * 60 * 60 * 1000))}</span> inclusive.
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<HeadlineCard label="Box 1 · Output VAT" value={fmtCents(rollup.totals.vat_cents)} tone="primary" />
				<HeadlineCard label="Box 4 · Input VAT" value={fmtCents(rollup.inputs.vat_cents)} />
				<HeadlineCard
					label="Box 5 · Net VAT due"
					value={`${rollup.net_vat_due_cents >= 0 ? "" : "−"}${fmtCents(Math.abs(rollup.net_vat_due_cents))}`}
					tone={rollup.net_vat_due_cents >= 0 ? "primary" : "destructive"}
				/>
				<HeadlineCard label="Box 6 · Sales ex VAT" value={fmtCents(rollup.totals.net_cents)} />
			</div>

			<section className="rounded-xl border bg-card overflow-hidden">
				<div className="px-5 py-3 border-b border-foreground/10 flex items-baseline justify-between gap-3 flex-wrap">
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
						Output VAT · sales
					</h2>
					<a
						href={csvHref}
						className="text-xs text-muted-foreground hover:text-foreground rounded-md border px-3 py-1.5"
					>
						Export CSV ↓
					</a>
				</div>
				<table className="w-full text-sm">
					<thead className="bg-muted/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						<tr>
							<th className="text-left px-5 py-2">Source</th>
							<th className="text-left px-5 py-2">Date basis</th>
							<th className="text-right px-5 py-2">Count</th>
							<th className="text-right px-5 py-2">Gross</th>
							<th className="text-right px-5 py-2">VAT</th>
							<th className="text-right px-5 py-2">Net</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-foreground/5">
						{rollup.streams.map((s) => (
							<tr key={s.key}>
								<td className="px-5 py-2.5">{s.label}</td>
								<td className="px-5 py-2.5 text-muted-foreground font-mono text-xs">{s.date_basis}</td>
								<td className="px-5 py-2.5 text-right font-mono tabular-nums">{s.count}</td>
								<td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtCents(s.gross_cents)}</td>
								<td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtCents(s.vat_cents)}</td>
								<td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtCents(s.net_cents)}</td>
							</tr>
						))}
						<tr className="bg-muted/30 font-medium">
							<td className="px-5 py-2.5">Total</td>
							<td />
							<td />
							<td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtCents(rollup.totals.gross_cents)}</td>
							<td className="px-5 py-2.5 text-right font-mono tabular-nums text-primary">{fmtCents(rollup.totals.vat_cents)}</td>
							<td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtCents(rollup.totals.net_cents)}</td>
						</tr>
					</tbody>
				</table>
			</section>

			<section className="rounded-xl border bg-card overflow-hidden">
				<div className="px-5 py-3 border-b border-foreground/10">
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
						Input VAT · purchases
					</h2>
				</div>
				<table className="w-full text-sm">
					<thead className="bg-muted/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						<tr>
							<th className="text-left px-5 py-2">Source</th>
							<th className="text-left px-5 py-2">Date basis</th>
							<th className="text-right px-5 py-2">Count</th>
							<th className="text-right px-5 py-2">Gross</th>
							<th className="text-right px-5 py-2">VAT</th>
							<th className="text-right px-5 py-2">Net</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-foreground/5">
						<tr>
							<td className="px-5 py-2.5">{rollup.inputs.label}</td>
							<td className="px-5 py-2.5 text-muted-foreground font-mono text-xs">{rollup.inputs.date_basis}</td>
							<td className="px-5 py-2.5 text-right font-mono tabular-nums">{rollup.inputs.count}</td>
							<td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtCents(rollup.inputs.gross_cents)}</td>
							<td className="px-5 py-2.5 text-right font-mono tabular-nums text-primary">{fmtCents(rollup.inputs.vat_cents)}</td>
							<td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtCents(rollup.inputs.net_cents)}</td>
						</tr>
					</tbody>
				</table>
				<div className="px-5 py-3 border-t border-foreground/10 text-xs text-muted-foreground">
					Captured from the <Link href="/admin/ledger/expenses" className="hover:text-foreground">Expenses ledger</Link>.
					Set <span className="font-mono">VAT (£)</span> to 0 on expenses where the supplier isn&apos;t VAT-registered.
				</div>
			</section>
		</div>
	);
}

function HeadlineCard({ label, value, tone = "default" }) {
	const toneClass =
		tone === "primary"
			? "border-primary/30 bg-primary/5"
			: "border-foreground/10 bg-card";
	const valueClass = tone === "primary" ? "text-primary" : "";
	return (
		<div className={`rounded-xl border p-5 space-y-1.5 ${toneClass}`}>
			<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
			<div className={`font-display text-2xl tracking-tight ${valueClass}`}>{value}</div>
		</div>
	);
}
