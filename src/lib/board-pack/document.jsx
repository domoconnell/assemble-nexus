import React from "react";
import {
	Document,
	Page,
	View,
	Text,
	StyleSheet,
} from "@react-pdf/renderer";
import { BankBalanceLineChart, PnlTrendChart } from "./charts/line-chart.jsx";
import { IncomePieChart } from "./charts/pie-chart.jsx";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const dateLongFmt = new Intl.DateTimeFormat("en-GB", {
	dateStyle: "long",
	timeStyle: "short",
	timeZone: "Europe/London",
});

const COLOURS = {
	text: "#0f172a",
	muted: "#64748b",
	border: "#e2e8f0",
	primary: "#0f766e",
	destructive: "#b91c1c",
	bgMuted: "#f8fafc",
	primaryBg: "#ecfdf5",
	destructiveBg: "#fef2f2",
};

const styles = StyleSheet.create({
	page: {
		paddingTop: 40,
		paddingBottom: 50,
		paddingHorizontal: 40,
		fontFamily: "Helvetica",
		fontSize: 10,
		color: COLOURS.text,
	},
	header: {
		marginBottom: 22,
		borderBottomWidth: 1,
		borderBottomColor: COLOURS.border,
		paddingBottom: 16,
	},
	kicker: {
		fontSize: 8,
		letterSpacing: 3,
		textTransform: "uppercase",
		color: COLOURS.muted,
		marginBottom: 6,
	},
	titleVenue: {
		fontSize: 11,
		color: COLOURS.muted,
		marginBottom: 2,
	},
	titleAddress: {
		fontSize: 9,
		color: COLOURS.muted,
		marginTop: 2,
	},
	title: {
		fontSize: 22,
		fontFamily: "Helvetica-Bold",
		letterSpacing: -0.4,
	},
	subtitle: {
		fontSize: 9,
		color: COLOURS.muted,
		marginTop: 6,
	},
	sectionTitle: {
		fontSize: 9,
		letterSpacing: 3,
		textTransform: "uppercase",
		color: COLOURS.muted,
		marginBottom: 10,
	},
	section: {
		marginBottom: 22,
	},
	rowMain: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
		paddingVertical: 3,
	},
	rowSub: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
		paddingLeft: 16,
		paddingVertical: 2,
	},
	mainLabel: {
		fontFamily: "Helvetica-Bold",
		fontSize: 10.5,
	},
	mainValue: {
		fontFamily: "Helvetica-Bold",
		fontSize: 10.5,
		fontVariant: ["tabular-nums"],
	},
	subLabel: {
		fontSize: 9.5,
		color: "#334155",
	},
	subValue: {
		fontSize: 9.5,
		color: "#334155",
		fontVariant: ["tabular-nums"],
	},
	subtotalRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
		borderTopWidth: 1,
		borderTopColor: COLOURS.border,
		paddingTop: 6,
		marginTop: 6,
	},
	subtotalLabel: {
		fontFamily: "Helvetica-Bold",
		fontSize: 10.5,
	},
	subtotalLabelSub: {
		fontSize: 8,
		letterSpacing: 2,
		textTransform: "uppercase",
		color: COLOURS.muted,
		marginLeft: 8,
	},
	subtotalValuePos: {
		fontFamily: "Helvetica-Bold",
		fontSize: 11,
		color: COLOURS.primary,
		fontVariant: ["tabular-nums"],
	},
	subtotalValueNeg: {
		fontFamily: "Helvetica-Bold",
		fontSize: 11,
		color: COLOURS.destructive,
		fontVariant: ["tabular-nums"],
	},
	spacer: {
		marginTop: 12,
	},
	highlightBox: {
		marginTop: 10,
		padding: 12,
		borderRadius: 6,
		borderWidth: 1,
	},
	highlightTitle: {
		fontSize: 8,
		letterSpacing: 3,
		textTransform: "uppercase",
		marginBottom: 4,
	},
	highlightValue: {
		fontSize: 26,
		fontFamily: "Helvetica-Bold",
		letterSpacing: -0.5,
	},
	highlightSub: {
		fontSize: 9,
		color: COLOURS.muted,
		marginTop: 4,
	},
	twoCol: {
		flexDirection: "row",
		gap: 16,
		marginTop: 8,
	},
	twoColCell: {
		flex: 1,
	},
	chartBox: {
		borderWidth: 1,
		borderColor: COLOURS.border,
		borderRadius: 6,
		padding: 8,
		backgroundColor: "#ffffff",
	},
	hirerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderWidth: 1,
		borderColor: COLOURS.border,
		borderRadius: 4,
		marginBottom: 4,
	},
	hirerName: {
		fontSize: 10,
		fontFamily: "Helvetica-Bold",
	},
	hirerMeta: {
		fontSize: 8,
		color: COLOURS.muted,
		marginTop: 2,
	},
	hirerValue: {
		fontSize: 10,
		fontFamily: "Helvetica-Bold",
		fontVariant: ["tabular-nums"],
	},
	categoryTable: {
		marginTop: 4,
		borderTopWidth: 1,
		borderTopColor: COLOURS.border,
	},
	categoryRow: {
		flexDirection: "row",
		paddingVertical: 4,
		borderBottomWidth: 0.5,
		borderBottomColor: COLOURS.border,
	},
	categoryName: {
		flex: 1,
		fontSize: 9.5,
	},
	categoryCount: {
		width: 50,
		fontSize: 9,
		color: COLOURS.muted,
		textAlign: "right",
	},
	categoryValue: {
		width: 80,
		fontSize: 9.5,
		fontVariant: ["tabular-nums"],
		textAlign: "right",
	},
	footer: {
		position: "absolute",
		bottom: 24,
		left: 40,
		right: 40,
		fontSize: 8,
		color: COLOURS.muted,
		flexDirection: "row",
		justifyContent: "space-between",
		borderTopWidth: 0.5,
		borderTopColor: COLOURS.border,
		paddingTop: 8,
	},
});

function MainRow({ label, value, spaceTop }) {
	return (
		<View style={[styles.rowMain, spaceTop && styles.spacer]}>
			<Text style={styles.mainLabel}>{label}</Text>
			<Text style={styles.mainValue}>{value}</Text>
		</View>
	);
}

function SubItem({ label, value, sub }) {
	return (
		<View style={styles.rowSub}>
			<View style={{ flexDirection: "column", flex: 1 }}>
				<Text style={styles.subLabel}>{label}</Text>
				{sub && (
					<Text style={{ fontSize: 7.5, color: COLOURS.muted, marginTop: 1 }}>
						{sub}
					</Text>
				)}
			</View>
			<Text style={styles.subValue}>{value}</Text>
		</View>
	);
}

function PaymentsOwedBlock({ paymentsOwed, tenancyOwed }) {
	const eventsTotal = paymentsOwed.this_month.total + paymentsOwed.previous.total;
	const tenancyTotal = tenancyOwed?.grand_total ?? 0;
	const total = eventsTotal + tenancyTotal;
	return (
		<View>
			<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
				<Text style={styles.sectionTitle}>Payments owed</Text>
				<Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{fmt(total)}</Text>
			</View>
			<View style={{ flexDirection: "row", gap: 8 }}>
				<PaymentsOwedColumn title="From events this month" bucket={paymentsOwed.this_month} />
				<PaymentsOwedColumn title="From previous events" bucket={paymentsOwed.previous} />
				<TenancyOwedColumnPdf split={tenancyOwed} />
			</View>
		</View>
	);
}

function TenancyOwedColumnPdf({ split }) {
	const thisMonth = split?.this_month ?? { total: 0, count: 0 };
	const previous = split?.previous ?? { total: 0, count: 0 };
	const total = split?.grand_total ?? 0;
	return (
		<View
			style={{
				flex: 1,
				borderWidth: 1,
				borderColor: COLOURS.border,
				borderRadius: 6,
				padding: 10,
			}}
		>
			<Text style={{ fontSize: 8, letterSpacing: 2, textTransform: "uppercase", color: COLOURS.muted, marginBottom: 6 }}>
				Tenancy invoices
			</Text>
			<View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
				<Text style={styles.subLabel}>
					This month{thisMonth.count > 0 ? ` (${thisMonth.count})` : ""}
				</Text>
				<Text style={styles.subValue}>{fmt(thisMonth.total)}</Text>
			</View>
			<View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
				<Text style={styles.subLabel}>
					Earlier months{previous.count > 0 ? ` (${previous.count})` : ""}
				</Text>
				<Text style={styles.subValue}>{fmt(previous.total)}</Text>
			</View>
			<View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: COLOURS.border, paddingTop: 5, marginTop: 4 }}>
				<Text style={styles.mainLabel}>Total</Text>
				<Text style={styles.mainValue}>{fmt(total)}</Text>
			</View>
		</View>
	);
}

function PaymentsOwedColumn({ title, bucket }) {
	return (
		<View
			style={{
				flex: 1,
				borderWidth: 1,
				borderColor: COLOURS.border,
				borderRadius: 6,
				padding: 10,
			}}
		>
			<Text style={{ fontSize: 8, letterSpacing: 2, textTransform: "uppercase", color: COLOURS.muted, marginBottom: 6 }}>
				{title}
			</Text>
			<View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
				<Text style={styles.subLabel}>Unpaid deposits</Text>
				<Text style={styles.subValue}>{fmt(bucket.unpaid_deposits)}</Text>
			</View>
			<View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
				<Text style={styles.subLabel}>Final payments</Text>
				<Text style={styles.subValue}>{fmt(bucket.unpaid_balances)}</Text>
			</View>
			<View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: COLOURS.border, paddingTop: 5, marginTop: 4 }}>
				<Text style={styles.mainLabel}>Total</Text>
				<Text style={styles.mainValue}>{fmt(bucket.total)}</Text>
			</View>
		</View>
	);
}

function BankSummaryBlock({ bankLatest }) {
	if (!bankLatest) {
		return (
			<View>
				<Text style={styles.sectionTitle}>Bank balance</Text>
				<View style={{ borderWidth: 1, borderColor: COLOURS.border, borderRadius: 6, padding: 12 }}>
					<Text style={{ fontSize: 10, color: COLOURS.muted }}>
						No bank accounts connected.
					</Text>
				</View>
			</View>
		);
	}
	const cleared = bankLatest.cleared_minor ?? 0;
	const accountCount = bankLatest.account_count ?? 1;
	const capturedFmt = new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Europe/London",
	});
	return (
		<View>
			<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
				<Text style={styles.sectionTitle}>Bank balance</Text>
				<Text style={{ fontSize: 8, color: COLOURS.muted }}>
					{accountCount} account{accountCount === 1 ? "" : "s"} · as at{" "}
					{capturedFmt.format(new Date(bankLatest.captured_at))}
				</Text>
			</View>
			<View style={{ flexDirection: "row", alignItems: "baseline", gap: 16 }}>
				<Text style={{ fontSize: 26, fontFamily: "Helvetica-Bold", color: COLOURS.text }}>
					{fmt(cleared)}
				</Text>
				{bankLatest.pending_minor !== 0 && (
					<Text style={{ fontSize: 9, color: COLOURS.muted }}>
						Pending {fmt(bankLatest.pending_minor)} · Effective {fmt(bankLatest.effective_minor)}
					</Text>
				)}
			</View>
		</View>
	);
}

function SubtotalRow({ label, sub, value, negative }) {
	const valueStyle = negative ? styles.subtotalValueNeg : styles.subtotalValuePos;
	return (
		<View style={styles.subtotalRow}>
			<View style={{ flexDirection: "row", alignItems: "baseline" }}>
				<Text style={styles.subtotalLabel}>{label}</Text>
				{sub && <Text style={styles.subtotalLabelSub}>{sub}</Text>}
			</View>
			<Text style={valueStyle}>{value}</Text>
		</View>
	);
}

export function BoardPackDocument({ data }) {
	const {
		venueName,
		venueAddress = [],
		ym,
		monthLabel,
		generatedAt,
		pnl,
		manualIncome,
		churchAvailable,
		monthlyTrend,
		bankDaily,
		bankLatest,
		paymentsOwed,
		tenancyOwed,
		topHirers,
		incomeItems,
		codItems,
		buildingItems,
		byCategory,
	} = data;

	const generatedStr = dateLongFmt.format(new Date(generatedAt));
	const transferable = churchAvailable.available_to_transfer;
	const incomePieSlices = [
		{ name: "Hire fees", value: pnl.income.bookings },
		{ name: "Ticket fees (net of Stripe)", value: pnl.income.tickets },
		{ name: "Cafe POS", value: pnl.income.pos_net },
		{ name: "Manual income", value: pnl.income.manual },
		{ name: "Rental (tenancies)", value: pnl.income.tenancy ?? 0 },
	];

	return (
		<Document
			title={`Board pack · ${ym} · ${venueName}`}
			author="Nexus"
			creator="Nexus"
			producer="Nexus"
		>
			{/* PAGE 1 - HEADER + MONEY FLOW */}
			<Page size="A4" style={styles.page}>
				<View style={styles.header}>
					<Text style={styles.kicker}>Director board pack</Text>
					<Text style={styles.titleVenue}>{venueName}</Text>
					<Text style={styles.title}>{monthLabel}</Text>
					{venueAddress.length > 0 && (
						<Text style={styles.titleAddress}>{venueAddress.join(", ")}</Text>
					)}
					<Text style={styles.subtitle}>Generated {generatedStr}</Text>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Money flow this month</Text>

					<MainRow label="Income" value={fmt(pnl.income.total)} />
					{incomeItems.map((it) => (
						<SubItem
							key={it.label}
							label={it.label}
							value={fmt(it.value)}
							sub={it.sub}
						/>
					))}

					<MainRow
						label="− Cost of business"
						value={`− ${fmt(pnl.cost_of_business)}`}
						spaceTop
					/>
					{codItems.map((it) => (
						<SubItem key={it.label} label={it.label} value={`− ${fmt(it.value)}`} />
					))}
					<SubItem label="Staff" value={`− ${fmt(pnl.fixed.staff)}`} />

					<SubtotalRow
						label="Business Net"
						value={fmt(pnl.business_net)}
						negative={pnl.business_net < 0}
					/>

					<MainRow
						label="− Cost of building"
						value={`− ${fmt(pnl.cost_of_building)}`}
						spaceTop
					/>
					{buildingItems.map((it) => (
						<SubItem key={it.label} label={it.label} value={`− ${fmt(it.value)}`} />
					))}

					<SubtotalRow
						label="Building Net"
						sub="Transferable to the church"
						value={fmt(pnl.building_net)}
						negative={pnl.building_net < 0}
					/>

					<MainRow
						label="− Extra mortgage"
						value={`− ${fmt(pnl.fixed.mortgage_extra)}`}
						spaceTop
					/>

					<SubtotalRow
						label="Ministry Net"
						value={fmt(pnl.ministry_net)}
						negative={pnl.ministry_net < 0}
					/>
				</View>

				<View
					style={[
						styles.highlightBox,
						{
							borderColor: transferable < 0 ? COLOURS.destructive : COLOURS.primary,
							backgroundColor: transferable < 0 ? COLOURS.destructiveBg : COLOURS.primaryBg,
						},
					]}
				>
					<Text style={[styles.highlightTitle, { color: transferable < 0 ? COLOURS.destructive : COLOURS.primary }]}>
						Actual transfer to church
					</Text>
					<Text style={[styles.highlightValue, { color: transferable < 0 ? COLOURS.destructive : COLOURS.primary }]}>
						{fmt(transferable)}
					</Text>
					<Text style={styles.highlightSub}>
						Historic sum of every month&apos;s Building Net minus every church transfer
						settled to date
						{churchAvailable.month_count > 0
							? ` · ${churchAvailable.month_count} month${churchAvailable.month_count === 1 ? "" : "s"} of P&L tracked.`
							: "."}
					</Text>
					<View style={{ flexDirection: "row", marginTop: 6, gap: 20 }}>
						<Text style={{ fontSize: 9, color: COLOURS.muted }}>
							Cumulative Building Net{" "}
							<Text style={{ fontFamily: "Helvetica-Bold", color: COLOURS.text }}>
								{fmt(churchAvailable.cumulative_available)}
							</Text>
						</Text>
						<Text style={{ fontSize: 9, color: COLOURS.muted }}>
							Transferred{" "}
							<Text style={{ fontFamily: "Helvetica-Bold", color: COLOURS.text }}>
								{fmt(churchAvailable.transferred_to_church)}
							</Text>
						</Text>
					</View>
				</View>

				<Footer venueName={venueName} ym={ym} pageLabel="1 · Money flow" />
			</Page>

			{/* PAGE 2 - PAYMENTS OWED + INCOME MIX + TOP HIRERS */}
			<Page size="A4" style={styles.page}>
				<View style={styles.section}>
					<PaymentsOwedBlock paymentsOwed={paymentsOwed} tenancyOwed={tenancyOwed} />
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Income mix this month</Text>
					<View style={styles.chartBox}>
						<IncomePieChart width={500} height={200} slices={incomePieSlices} />
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Top hirers by spend</Text>
					{topHirers.length === 0 ? (
						<Text style={{ fontSize: 10, color: COLOURS.muted }}>
							No bookings paid this month.
						</Text>
					) : (
						topHirers.map((h, i) => (
							<View key={`${h.name}-${i}`} style={styles.hirerRow}>
								<View style={{ flexDirection: "row", gap: 10, alignItems: "baseline", flex: 1 }}>
									<Text style={{ fontSize: 10, color: COLOURS.muted, width: 12 }}>{i + 1}</Text>
									<View style={{ flex: 1 }}>
										<Text style={styles.hirerName}>{h.name}</Text>
										<Text style={styles.hirerMeta}>
											{h.bookings_count} booking{h.bookings_count === 1 ? "" : "s"}
										</Text>
									</View>
								</View>
								<Text style={styles.hirerValue}>{fmt(h.revenue_cents)}</Text>
							</View>
						))
					)}
				</View>

				<Footer venueName={venueName} ym={ym} pageLabel="2 · Receivables & income" />
			</Page>

			{/* PAGE 3 - BANK + TREND */}
			<Page size="A4" style={styles.page}>
				<View style={styles.section}>
					<BankSummaryBlock bankLatest={bankLatest} />
				</View>

				{bankDaily.length > 0 ? (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Bank balance over time</Text>
						<View style={styles.chartBox}>
							<BankBalanceLineChart width={500} height={220} daily={bankDaily} />
						</View>
					</View>
				) : (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Bank balance over time</Text>
						<View
							style={{
								borderWidth: 1,
								borderColor: COLOURS.border,
								borderStyle: "dashed",
								borderRadius: 6,
								padding: 16,
							}}
						>
							<Text style={{ fontSize: 10, color: COLOURS.muted, textAlign: "center" }}>
								No balance snapshots yet. The nightly cron writes one per day once a bank account is connected.
							</Text>
						</View>
					</View>
				)}

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Income vs costs · last 12 months</Text>
					<View style={styles.chartBox}>
						<PnlTrendChart width={500} height={220} months={monthlyTrend} />
					</View>
				</View>

				<Footer venueName={venueName} ym={ym} pageLabel="3 · Bank & trends" />
			</Page>

			{/* PAGE 4 - COST OF DELIVERY DETAIL */}
			<Page size="A4" style={styles.page}>
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Cost of delivery breakdown</Text>
					{byCategory.length === 0 ? (
						<Text style={{ fontSize: 10, color: COLOURS.muted }}>
							No operational expenses this month.
						</Text>
					) : (
						<View style={styles.categoryTable}>
							<View style={[styles.categoryRow, { borderBottomColor: COLOURS.text }]}>
								<Text style={[styles.categoryName, { fontFamily: "Helvetica-Bold" }]}>
									Category
								</Text>
								<Text style={[styles.categoryCount, { fontFamily: "Helvetica-Bold" }]}>
									Count
								</Text>
								<Text style={[styles.categoryValue, { fontFamily: "Helvetica-Bold" }]}>
									Total
								</Text>
							</View>
							{byCategory.map((row) => (
								<View key={row.name} style={styles.categoryRow}>
									<Text style={styles.categoryName}>
										{row.name}
										{!row.is_cost_of_delivery && (
											<Text style={{ fontSize: 8, color: COLOURS.muted }}>
												{" "}
												(off-formula)
											</Text>
										)}
									</Text>
									<Text style={styles.categoryCount}>{row.count}</Text>
									<Text style={styles.categoryValue}>{fmt(row.total)}</Text>
								</View>
							))}
						</View>
					)}
				</View>

				{manualIncome.length > 0 && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Manual income detail</Text>
						<View style={styles.categoryTable}>
							{manualIncome.map((m) => (
								<View key={m.id} style={styles.categoryRow}>
									<Text style={styles.categoryName}>
										{m.description}
										<Text style={{ fontSize: 8, color: COLOURS.muted }}>
											{" "}
											({m.kind})
										</Text>
									</Text>
									<Text style={styles.categoryValue}>{fmt(m.amount_cents)}</Text>
								</View>
							))}
						</View>
					</View>
				)}

				<Footer venueName={venueName} ym={ym} pageLabel="4 · Detail" />
			</Page>
		</Document>
	);
}

function Footer({ venueName, ym, pageLabel }) {
	return (
		<View style={styles.footer} fixed>
			<Text>
				{venueName} · Board pack · {ym}
			</Text>
			<Text>{pageLabel}</Text>
		</View>
	);
}
