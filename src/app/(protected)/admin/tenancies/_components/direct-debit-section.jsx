"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import {
	sendDdSetupEmailAction,
	removeTenancyDdMandateAction,
} from "../actions";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric", month: "short", year: "numeric",
	hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
});

/**
 * Standalone Direct Debit panel. Surfaces the public DD setup link and a
 * one-click email button so staff can prompt the tenant to set up the
 * mandate independently of any agreement. Once the mandate is active we
 * show the saved Stripe IDs, a timestamp, and a "Remove mandate" affordance
 * so the admin can wind it down (e.g. tenant asked to switch accounts).
 */
export default function DirectDebitSection({ tenancy }) {
	const router = useRouter();
	const [sending, setSending] = useState(false);
	const [confirmingRemove, setConfirmingRemove] = useState(false);
	const [removing, setRemoving] = useState(false);

	const ready = !!tenancy.direct_debit_ready_at;
	const link = tenancy.dd_token ? `/tenancy/${tenancy.dd_token}/direct-debit` : null;

	async function sendEmail() {
		setSending(true);
		try {
			await sendDdSetupEmailAction(tenancy.id);
			toast.success("Direct debit email sent");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not send email.");
		} finally {
			setSending(false);
		}
	}

	async function removeMandate() {
		setRemoving(true);
		try {
			await removeTenancyDdMandateAction(tenancy.id);
			toast.success("Direct debit mandate removed.");
			setConfirmingRemove(false);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not remove mandate.");
		} finally {
			setRemoving(false);
		}
	}

	return (
		<section className="space-y-3">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Direct debit
				</h2>
				{!ready && (
					<Button size="sm" onClick={sendEmail} disabled={sending}>
						{sending ? "Sending…" : "Send direct debit email"}
					</Button>
				)}
			</div>
			<div className="rounded-lg border bg-card p-4 space-y-3">
				{ready ? (
					<>
						<div className="flex items-center justify-between gap-3 flex-wrap">
							<div className="flex items-center gap-2">
								<span className="text-[10px] uppercase tracking-[0.18em] rounded-full border border-primary/30 bg-primary/10 text-primary px-2 py-0.5">
									Active
								</span>
								<span className="text-xs text-muted-foreground">
									Mandate confirmed{" "}
									{dateTimeFmt.format(new Date(tenancy.direct_debit_ready_at))}
								</span>
							</div>
							{!confirmingRemove && (
								<Button
									size="sm"
									variant="ghost"
									onClick={() => setConfirmingRemove(true)}
								>
									Remove mandate
								</Button>
							)}
						</div>
						<div className="text-xs text-muted-foreground space-y-1">
							{tenancy.direct_debit_mandate_id && (
								<div>
									Mandate ID:{" "}
									<span className="font-mono">{tenancy.direct_debit_mandate_id}</span>
								</div>
							)}
							{tenancy.stripe_customer_id && (
								<div>
									Stripe customer:{" "}
									<span className="font-mono">{tenancy.stripe_customer_id}</span>
								</div>
							)}
						</div>

						{confirmingRemove && (
							<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
								<div className="text-xs text-destructive font-medium">
									Remove this Direct Debit mandate?
								</div>
								<div className="text-xs text-muted-foreground">
									The saved bank details will be cleared and detached at the
									PSP, so no future invoice can be auto-collected. The
									setup link stays the same so the tenant (or you) can
									connect a fresh account.
								</div>
								<div className="flex items-center gap-2">
									<Button
										size="sm"
										variant="destructive"
										onClick={removeMandate}
										disabled={removing}
									>
										{removing ? "Removing…" : "Remove mandate"}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setConfirmingRemove(false)}
										disabled={removing}
									>
										Keep
									</Button>
								</div>
							</div>
						)}
					</>
				) : (
					<>
						<div className="flex items-center gap-2">
							<span className="text-[10px] uppercase tracking-[0.18em] rounded-full border border-foreground/15 text-muted-foreground px-2 py-0.5">
								Not yet set up
							</span>
						</div>
						<p className="text-xs text-muted-foreground">
							The tenant can set up their mandate using the link below - it works
							independently of any agreement, so it stays valid for the life of
							the tenancy. Use <em>Send direct debit email</em> above to email
							them the link directly.
						</p>
						{link ? (
							<div className="flex items-center gap-2 flex-wrap">
								<a
									href={link}
									target="_blank"
									rel="noreferrer"
									className="text-xs text-foreground underline"
								>
									Open setup link →
								</a>
								<code className="text-[11px] text-muted-foreground break-all">
									{link}
								</code>
							</div>
						) : (
							<p className="text-[11px] text-muted-foreground italic">
								The direct debit link is generated the first time you send the
								email - click the button above.
							</p>
						)}
					</>
				)}
			</div>
		</section>
	);
}
