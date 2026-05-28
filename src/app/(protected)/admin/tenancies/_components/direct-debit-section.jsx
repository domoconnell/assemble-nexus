import Link from "next/link";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric", month: "short", year: "numeric",
	hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
});

/**
 * Read-only mirror of the organisation's Direct Debit posture. Mandates
 * live on the organisation (one mandate covers any number of tenancies
 * + one-off charges), so all mandate-management actions live on the CRM
 * org page - this section just surfaces the state and links there.
 */
export default function DirectDebitSection({ tenancy }) {
	const ready = !!tenancy.org_direct_debit_ready_at;
	const orgHref = tenancy.organisation_id
		? `/admin/crm/${tenancy.organisation_id}`
		: null;

	return (
		<section className="space-y-3">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Direct debit
				</h2>
				{orgHref && (
					<Link
						href={orgHref}
						className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
					>
						Manage on organisation page →
					</Link>
				)}
			</div>
			<div className="rounded-lg border bg-card p-4 space-y-3">
				{ready ? (
					<>
						<div className="flex items-center gap-2">
							<span className="text-[10px] uppercase tracking-[0.18em] rounded-full border border-primary/30 bg-primary/10 text-primary px-2 py-0.5">
								Active
							</span>
							<span className="text-xs text-muted-foreground">
								Mandate confirmed{" "}
								{dateTimeFmt.format(new Date(tenancy.org_direct_debit_ready_at))}
							</span>
						</div>
						<div className="text-xs text-muted-foreground space-y-1">
							{tenancy.org_direct_debit_mandate_id && (
								<div>
									Mandate ID:{" "}
									<span className="font-mono">{tenancy.org_direct_debit_mandate_id}</span>
								</div>
							)}
							{tenancy.org_stripe_customer_id && (
								<div>
									Stripe customer:{" "}
									<span className="font-mono">{tenancy.org_stripe_customer_id}</span>
								</div>
							)}
						</div>
						<p className="text-[11px] text-muted-foreground pt-1 border-t border-foreground/10">
							The mandate belongs to the organisation, so every tenancy under it
							shares this one direct debit. Remove or replace it from the
							organisation page above.
						</p>
					</>
				) : (
					<>
						<div className="flex items-center gap-2">
							<span className="text-[10px] uppercase tracking-[0.18em] rounded-full border border-foreground/15 text-muted-foreground px-2 py-0.5">
								Not yet set up
							</span>
						</div>
						<p className="text-xs text-muted-foreground">
							The organisation has no direct debit on file yet. Send the setup
							link or share the URL from the organisation page - once captured,
							it covers every tenancy belonging to this organisation.
						</p>
					</>
				)}
			</div>
		</section>
	);
}
