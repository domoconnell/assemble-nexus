import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPaymentsSettings, getStripeSettings } from "@/db/queries/settings";
import PaymentsEditor from "./_components/payments-editor";
import StripeEditor from "./_components/stripe-editor";

export const dynamic = "force-dynamic";

export default async function PaymentsSettingsPage() {
	const venue = await requireCurrentVenue();
	const [initial, stripeInitial] = await Promise.all([
		getPaymentsSettings(venue.id),
		getStripeSettings(venue.id),
	]);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-8">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Payments</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Pick the card-payment provider used for deposits, invoices and ticket
					orders at this venue. Every consumer goes through a common driver
					interface so you can switch providers without rewriting flows.
				</p>
			</div>
			<PaymentsEditor initial={initial} />
			<StripeEditor initial={stripeInitial} />
		</div>
	);
}
