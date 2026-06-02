"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { sendWelcomeEmailAction } from "../actions";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric", month: "short", year: "numeric",
	hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
});

/**
 * Top-of-page status strip showing the 3 onboarding milestones plus the
 * "Send welcome email" button. The button is only enabled when there's a
 * draft agreement, no signed agreement, and no active direct debit -
 * i.e. the happy-path first contact has not yet happened.
 */
export default function JourneyHeader({ tenancy, agreements }) {
	const router = useRouter();
	const [sending, setSending] = useState(false);

	const hasDraft = agreements.some((a) => a.status === "draft");
	const hasSent = agreements.some((a) => a.status === "sent");
	const signed = agreements.find((a) => a.status === "signed");
	const ddReady = !!tenancy.org_direct_debit_ready_at;

	const agreementCreated = agreements.length > 0;
	const welcomeEligible = hasDraft && !signed && !ddReady;

	async function sendWelcome() {
		setSending(true);
		try {
			await sendWelcomeEmailAction(tenancy.id);
			toast.success("Welcome email sent");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not send welcome email.");
		} finally {
			setSending(false);
		}
	}

	const autoBill = !!tenancy.auto_bill_via_dd;
	const steps = [
		{
			label: "Agreement created",
			done: agreementCreated,
			detail: hasSent && !signed ? "Awaiting tenant signature" : null,
		},
		{
			label: "Agreement signed",
			done: !!signed,
			detail: signed
				? `${signed.signed_by_name ?? "Tenant"} on ${dateTimeFmt.format(new Date(signed.signed_at))}`
				: null,
		},
		{
			label: "Direct debit set up",
			done: ddReady,
			detail: ddReady
				? `Mandate ${tenancy.org_direct_debit_mandate_id?.slice(0, 12)}…`
				: null,
		},
		{
			label: "Auto-billing",
			done: autoBill && ddReady,
			detail: autoBill
				? ddReady
					? "Invoices auto-charged via DD"
					: "Enabled, but DD not active yet"
				: "Manual — invoices issued only",
		},
	];

	return (
		<section className="rounded-lg border bg-card p-6 space-y-4">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Onboarding journey
				</h2>
				<Button
					size="sm"
					onClick={sendWelcome}
					disabled={!welcomeEligible || sending}
					title={
						!welcomeEligible
							? "Available when a draft exists and the tenant hasn't signed or set up DD yet."
							: undefined
					}
				>
					{sending ? "Sending…" : "Send welcome email"}
				</Button>
			</div>

			<ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{steps.map((s, i) => (
					<li
						key={s.label}
						className={`rounded-md border px-4 py-3 ${
							s.done ? "border-primary/30 bg-primary/5" : "border-foreground/10 bg-background"
						}`}
					>
						<div className="flex items-baseline justify-between gap-2">
							<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
								Step {i + 1}
							</span>
							{s.done && (
								<span className="text-[10px] uppercase tracking-[0.18em] text-primary">
									done
								</span>
							)}
						</div>
						<div className="text-sm font-medium mt-1">{s.label}</div>
						{s.detail && (
							<div className="text-[11px] text-muted-foreground mt-1 truncate">
								{s.detail}
							</div>
						)}
					</li>
				))}
			</ol>
		</section>
	);
}
