import Link from "next/link";

const groups = [
	{
		section: "Venue",
		cards: [
			{ title: "Venue profile", description: "Venue name used in every email signoff, the board pack PDF, and anywhere else the platform displays it.", href: "/admin/settings/venue" },
		],
	},
	{
		section: "Booking",
		cards: [
			{ title: "Booking types", description: "Event day, setup day, rehearsal - and their default rate modifiers.", href: "/admin/settings/booking-types" },
			{ title: "Booking agreement", description: "H&S, T&Cs, and other policies the customer agrees to before paying.", href: "/admin/settings/booking-agreement" },
			{ title: "Deposit policy", description: "Deposit %, non-refundable %, and the cancellation window.", href: "/admin/settings/deposit-policy" },
			{ title: "Discounts", description: "Local-business, youth-activity, and other discounts customers can apply.", href: "/admin/settings/discounts" },
			{ title: "Hours & rate bands", description: "Operating hours and unsociable-hour rate modifiers (e.g. evening +20%).", href: "/admin/settings/hours" },
			{ title: "Tenancy agreement", description: "WYSIWYG template copied onto each new tenancy. Handlebars-style merge variables.", href: "/admin/settings/tenancy-agreements" },
		],
	},
	{
		section: "Ticketing",
		cards: [
			{ title: "Platform fees", description: "Per-ticket platform fees on ticketed events.", href: "/admin/settings/ticketing" },
			{ title: "Wallets & passes", description: "Apple Wallet and Google Wallet issuer credentials for ticket passes.", href: "/admin/settings/wallets" },
		],
	},
	{
		section: "Connections",
		cards: [
			{ title: "Bank accounts", description: "Connect one or more bank accounts (Starling, Revolut). Balances and transactions feed the ledger.", href: "/admin/settings/bank-accounts" },
			{ title: "Payments", description: "Card-payment provider: FakePSP for dev/demo, Stripe once go-live ships.", href: "/admin/settings/payments" },
			{ title: "POS", description: "Connect Square so daily café & bar takings flow into the ledger.", href: "/admin/settings/pos" },
			{ title: "Church transfers", description: "Identify the church's bank account so outbound transfers are auto-tagged in the ledger.", href: "/admin/settings/church-transfer" },
		],
	},
	{
		section: "System",
		cards: [
			{ title: "Users & roles", description: "Add admins, assign roles, and re-send welcome magic links. Anyone who can log in to Nexus lives here.", href: "/admin/users" },
		],
	},
];

export default function SettingsPage() {
	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-10">
			<div>
				<h1 className="text-2xl font-semibold">Settings</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Booking-related configuration.
				</p>
			</div>
			{groups.map((group) => (
				<section key={group.section} className="space-y-3">
					<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
						{group.section}
					</h2>
					<div className="grid gap-4 sm:grid-cols-2">
						{group.cards.map((c) => (
							<Link
								key={c.href}
								href={c.href}
								className="rounded-lg border bg-card p-5 transition hover:border-primary/40"
							>
								<h3 className="font-medium">{c.title}</h3>
								<p className="text-sm text-muted-foreground mt-1">{c.description}</p>
							</Link>
						))}
					</div>
				</section>
			))}
		</div>
	);
}
