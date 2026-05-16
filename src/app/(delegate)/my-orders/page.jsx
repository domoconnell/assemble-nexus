import Link from "next/link";
import { Container } from "@/site/ui/container";
import { Hero } from "@/site/ui/hero";
import { CtaButton } from "@/site/ui/cta-button";
import { getServerSession } from "@/utils/auth/server-guard";
import { listOrdersForUser } from "@/db/queries/orders";
import MagicLinkForm from "../_components/magic-link-form";
import DelegateNav from "../_components/delegate-nav";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "My orders - The Assembly Rooms",
};

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);
const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});

function statusClass(status) {
	switch (status) {
		case "pending":
			return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
		case "paid":
			return "border-primary/30 bg-primary/10 text-primary";
		case "cancelled":
		case "refunded":
		case "partially_refunded":
			return "border-destructive/30 bg-destructive/10 text-destructive";
		default:
			return "border-foreground/15 bg-muted text-muted-foreground";
	}
}

export default async function MyOrdersPage() {
	const session = await getServerSession();

	if (!session?.user) {
		return (
			<>
				<Hero
					height="short"
					kicker="Your orders"
					title="Sign in to see your orders."
					subtitle="No password needed - we'll email you a one-click link."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm
						callbackURL="/my-orders"
						heading="See your orders"
					/>
				</Container>
			</>
		);
	}

	const orders = await listOrdersForUser(session.user.id);

	return (
		<>
			<Hero
				height="short"
				kicker="Your orders"
				title="Your orders"
				subtitle="Receipts and ticket bundles for events you've bought into."
			/>
			<Container className="pt-6 pb-12 lg:pb-16 space-y-6">
				<DelegateNav current="orders" email={session.user.email} redirectTo="/my-orders" />

				{orders.length === 0 ? (
					<div className="rounded-xl border border-foreground/10 bg-card p-10 text-center space-y-4">
						<h2 className="font-display text-2xl tracking-tight">No orders yet.</h2>
						<p className="text-muted-foreground max-w-md mx-auto">
							Orders you make for events at The Assembly Rooms will appear here.
						</p>
						<CtaButton href="/whats-on">Browse what&apos;s on</CtaButton>
					</div>
				) : (
					<ul className="space-y-3">
						{orders.map((o) => (
							<li key={o.id}>
								<Link
									href={`/my-orders/${o.reference}`}
									className="flex items-baseline justify-between gap-4 rounded-lg border border-foreground/10 bg-card p-4 hover:border-foreground/30 transition"
								>
									<div className="min-w-0">
										<div className="flex items-center gap-3 flex-wrap">
											<span className="font-medium truncate">{o.event_title}</span>
											<span
												className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs capitalize ${statusClass(o.status)}`}
											>
												{o.status.replace("_", " ")}
											</span>
										</div>
										<div className="mt-1 text-xs text-muted-foreground font-mono">
											{o.reference}
											{o.event_starts_at && (
												<span> · {dateFmt.format(new Date(o.event_starts_at))}</span>
											)}
										</div>
									</div>
									<div className="font-mono text-sm shrink-0">
										{formatGbp(o.total_cents)}
									</div>
								</Link>
							</li>
						))}
					</ul>
				)}
			</Container>
		</>
	);
}
