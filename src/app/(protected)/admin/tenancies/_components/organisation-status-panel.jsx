"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/shadcn/components/ui/button";
import { sendOrganisationDdSetupEmailAction } from "../../crm/actions";

/**
 * Shown in the tenancy form once an organisation is picked, so the admin
 * can see at-a-glance whether the org has a primary contact, an active
 * direct debit, and (on the edit page) the agreement journey. On the new
 * page the agreement controls are stubbed with "Save first to send" so the
 * admin knows they'll appear after the tenancy is created.
 */
export default function OrganisationStatusPanel({ organisation, isEdit }) {
	const router = useRouter();
	const [sendingDd, setSendingDd] = useState(false);

	if (!organisation) return null;

	const ddReady = !!organisation.direct_debit_ready_at;
	const hasContactEmail = !!organisation.primary_contact_email;

	async function sendDdSetup() {
		setSendingDd(true);
		try {
			await sendOrganisationDdSetupEmailAction(organisation.id);
			toast.success("Direct debit setup link sent");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not send DD setup link.");
		} finally {
			setSendingDd(false);
		}
	}

	return (
		<section className="rounded-lg border bg-card p-6 space-y-4">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					{organisation.name}
				</h2>
				<Link
					href={`/admin/crm/${organisation.id}`}
					className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
				>
					Open organisation page →
				</Link>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="rounded-md border bg-background p-4 space-y-1">
					<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Primary contact
					</div>
					{hasContactEmail ? (
						<>
							<div className="text-sm font-medium">
								{organisation.primary_contact_name || "(unnamed)"}
							</div>
							<div className="text-xs text-muted-foreground break-all">
								{organisation.primary_contact_email}
							</div>
						</>
					) : (
						<div className="text-sm text-destructive">
							No contact email. Add one in CRM before sending anything.
						</div>
					)}
				</div>

				<div className="rounded-md border bg-background p-4 space-y-2">
					<div className="flex items-center justify-between gap-2">
						<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							Direct debit
						</div>
						<span
							className={`text-[10px] uppercase tracking-[0.18em] rounded-full border px-2 py-0.5 ${
								ddReady
									? "border-primary/30 bg-primary/10 text-primary"
									: "border-foreground/15 text-muted-foreground"
							}`}
						>
							{ddReady ? "Active" : "Not set up"}
						</span>
					</div>
					{ddReady ? (
						<p className="text-xs text-muted-foreground">
							Mandate in place. Auto-billing is available below.
						</p>
					) : (
						<div className="space-y-2">
							<p className="text-xs text-muted-foreground">
								Send the setup link to {organisation.primary_contact_name || "the contact"} to
								capture a mandate. One mandate covers every tenancy on this org.
							</p>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={sendDdSetup}
								disabled={!hasContactEmail || sendingDd}
							>
								{sendingDd ? "Sending…" : "Send DD setup link"}
							</Button>
						</div>
					)}
				</div>
			</div>

			{!isEdit && (
				<div className="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
					After saving, you'll be able to draft + send the tenancy agreement and
					send the welcome email from the tenancy page.
				</div>
			)}
		</section>
	);
}
