"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelSessionAction, uncancelSessionAction } from "../actions";

export default function SessionRow({ session, dateFmt, muted }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const isCancelled = session.status === "cancelled";

	function toggle() {
		startTransition(async () => {
			try {
				if (isCancelled) {
					await uncancelSessionAction(session.id);
					toast.success("Session restored");
				} else {
					await cancelSessionAction({ session_id: session.id, reason: null });
					toast.success("Session cancelled");
				}
				router.refresh();
			} catch (err) {
				toast.error(err?.message || "Couldn't update session.");
			}
		});
	}

	return (
		<li
			className={`flex items-baseline justify-between gap-3 px-4 py-3 ${muted ? "opacity-70" : ""} ${isCancelled ? "line-through text-muted-foreground" : ""}`}
		>
			<div className="min-w-0 flex-1">
				<div className="text-sm">{dateFmt.format(new Date(session.starts_at))}</div>
				<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					{session.status}
					{isCancelled && session.cancelled_reason ? ` · ${session.cancelled_reason}` : ""}
				</div>
			</div>
			<button
				type="button"
				onClick={toggle}
				disabled={pending}
				className={`rounded-md border px-2.5 py-1 text-xs transition ${
					isCancelled
						? "border-primary/30 text-primary hover:bg-primary/10"
						: "border-foreground/15 text-muted-foreground hover:text-foreground hover:border-foreground/30"
				} ${pending ? "opacity-50" : ""}`}
			>
				{pending
					? "…"
					: isCancelled
						? "Restore"
						: "Cancel this date"}
			</button>
		</li>
	);
}
