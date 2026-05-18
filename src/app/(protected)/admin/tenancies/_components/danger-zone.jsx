"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import { updateTenancyAction, deleteTenancyAction } from "../actions";

/**
 * End-of-life controls for a tenancy. Pause toggles status between
 * active <-> paused (kept light because it's reversible). Ending the
 * tenancy soft-deletes it and stamps status="ended" - the materialiser
 * stops topping up sessions and the row drops out of the active list.
 */
export default function DangerZone({ tenancy }) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [endOpen, setEndOpen] = useState(false);

	const isPaused = tenancy.status === "paused";
	const isEnded = tenancy.status === "ended";

	async function togglePause() {
		setBusy(true);
		try {
			await updateTenancyAction({
				id: tenancy.id,
				status: isPaused ? "active" : "paused",
			});
			toast.success(isPaused ? "Tenancy resumed" : "Tenancy paused");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not update status.");
		} finally {
			setBusy(false);
		}
	}

	async function endTenancy() {
		try {
			await deleteTenancyAction(tenancy.id);
			toast.success("Tenancy ended");
			router.push("/admin/tenancies");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not end tenancy.");
		}
	}

	if (isEnded) return null;

	return (
		<section className="space-y-3">
			<h2 className="text-xs uppercase tracking-[0.22em] text-destructive">
				Danger zone
			</h2>
			<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-4">
				<div className="flex items-baseline justify-between gap-3 flex-wrap">
					<div>
						<div className="text-sm font-medium">
							{isPaused ? "Resume tenancy" : "Pause tenancy"}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							{isPaused
								? "Resume billing and re-enable session materialisation."
								: "Stop materialising new sessions and skip the next invoice run. Reversible."}
						</p>
					</div>
					<Button size="sm" variant="outline" onClick={togglePause} disabled={busy}>
						{busy ? "Working…" : isPaused ? "Resume" : "Pause"}
					</Button>
				</div>

				<div className="border-t border-destructive/20 pt-4 flex items-baseline justify-between gap-3 flex-wrap">
					<div>
						<div className="text-sm font-medium">End tenancy</div>
						<p className="text-xs text-muted-foreground mt-1">
							Marks the tenancy ended and removes it from the active list. No
							future sessions or invoices will be generated. Past invoices and
							sessions are kept for the record.
						</p>
					</div>
					<Button
						size="sm"
						variant="destructive"
						onClick={() => setEndOpen(true)}
					>
						End tenancy
					</Button>
				</div>
			</div>

			<ConfirmDialog
				open={endOpen}
				onOpenChange={setEndOpen}
				title="End this tenancy?"
				description="The tenancy will be marked ended and won't generate any further sessions or invoices. Past records are kept."
				confirmLabel="End tenancy"
				cancelLabel="Keep"
				destructive
				onConfirm={endTenancy}
			/>
		</section>
	);
}
