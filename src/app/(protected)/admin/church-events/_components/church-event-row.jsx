"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import {
	deleteChurchEventAction,
	deleteChurchEventSeriesAction,
} from "../actions";

export default function ChurchEventRow({ id, seriesId, title, subtitle, notes, isSeries }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [confirming, setConfirming] = useState(false);

	function remove() {
		startTransition(async () => {
			try {
				if (isSeries && seriesId) {
					await deleteChurchEventSeriesAction(seriesId);
					toast.success("Series and all occurrences removed");
				} else {
					await deleteChurchEventAction(id);
					toast.success("Removed");
				}
				router.refresh();
			} catch (err) {
				toast.error(err?.message || "Couldn't remove.");
			}
		});
	}

	return (
		<li className="flex items-baseline justify-between gap-3 px-4 py-3">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{title}</div>
				<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
					{subtitle}
				</div>
				{notes && (
					<div className="text-xs text-muted-foreground mt-1 truncate">{notes}</div>
				)}
			</div>
			<div className="flex items-center gap-2">
				<Link
					href={`/admin/church-events/${id}`}
					className="rounded-md border border-foreground/15 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
				>
					Edit
				</Link>
				<button
					type="button"
					onClick={() => setConfirming(true)}
					disabled={pending}
					className="rounded-md border border-foreground/15 px-2.5 py-1 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30"
				>
					{isSeries ? "Cancel series" : "Cancel"}
				</button>
			</div>
			<ConfirmDialog
				open={confirming}
				onOpenChange={setConfirming}
				title={isSeries ? "Cancel this series?" : "Cancel this church event?"}
				description={
					isSeries
						? "Removes the series definition and every materialised occurrence."
						: "Soft-deletes this one occurrence."
				}
				confirmLabel="Remove"
				destructive
				onConfirm={remove}
			/>
		</li>
	);
}
