import Link from "next/link";

const cards = [
	{
		title: "Booking types",
		description: "Event day, setup day, rehearsal — and their default rate modifiers.",
		href: "/admin/settings/booking-types",
	},
	{
		title: "Deposit policy",
		description: "Deposit %, non-refundable %, and the cancellation window.",
		href: "/admin/settings/deposit-policy",
	},
	{
		title: "Booking agreement",
		description: "H&S, T&Cs, and other policies the customer agrees to before paying.",
		href: "/admin/settings/booking-agreement",
	},
	{
		title: "Discounts",
		description: "Local-business, youth-activity, and other discounts customers can apply.",
		href: "/admin/settings/discounts",
	},
	{
		title: "Ticketing",
		description: "Per-ticket platform fees for events ticketed through The Assembly Rooms.",
		href: "/admin/settings/ticketing",
	},
	{
		title: "Payments",
		description: "Card-payment provider: FakePSP for dev/demo, Stripe once go-live ships.",
		href: "/admin/settings/payments",
	},
	{
		title: "Bank accounts",
		description: "Connect one or more bank accounts (Starling, Revolut). Balances and transactions feed the dashboard and the Banking page.",
		href: "/admin/settings/bank-accounts",
	},
	{
		title: "POS",
		description: "Connect Square so daily café & bar takings flow into the ledger.",
		href: "/admin/settings/pos",
	},
	{
		title: "Hours & rate bands",
		description: "Operating hours and unsociable-hour rate modifiers (e.g. evening +20%).",
		href: "/admin/settings/hours",
	},
];

export default function SettingsPage() {
	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div>
				<h1 className="text-2xl font-semibold">Settings</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Booking-related configuration.
				</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				{cards.map((c) => (
					<Link
						key={c.href}
						href={c.href}
						className="rounded-lg border bg-card p-5 transition hover:border-primary/40"
					>
						<h2 className="font-medium">{c.title}</h2>
						<p className="text-sm text-muted-foreground mt-1">{c.description}</p>
					</Link>
				))}
			</div>
		</div>
	);
}
