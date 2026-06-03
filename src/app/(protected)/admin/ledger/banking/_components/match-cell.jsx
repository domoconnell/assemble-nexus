"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/shadcn/components/ui/dropdown-menu";
import {
	unmatchTransactionAction,
	rematchTransactionAction,
} from "../actions";

/**
 * Match-state pill with a context menu. Shown in its own column so the
 * admin can see at a glance which inbound transactions still need a
 * home. Outbound transactions get a muted "—" — match wiring only
 * targets inbound payments for now.
 */
export default function MatchCell({
	transactionId,
	direction,
	matchedToType,
	matchedReference,
	matchedInvoiceStatus,
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);

	if (direction !== "IN") {
		return <span className="text-muted-foreground/60 text-xs">—</span>;
	}

	const isMatched = !!matchedReference;

	async function unmatch() {
		setBusy(true);
		try {
			await unmatchTransactionAction({ transaction_id: transactionId });
			toast.success("Unmatched");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't unmatch");
		} finally {
			setBusy(false);
		}
	}

	async function rematch() {
		setBusy(true);
		try {
			const res = await rematchTransactionAction({ transaction_id: transactionId });
			if (res?.matched > 0) {
				toast.success(`Rematched (${res.matched})`);
			} else if (res?.ambiguous > 0) {
				toast.info("Multiple candidates — pick manually from the invoice.");
			} else {
				toast.info("No match found.");
			}
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't rematch");
		} finally {
			setBusy(false);
		}
	}

	const pillClass = isMatched
		? "border-primary/30 bg-primary/10 text-primary"
		: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
	const label = isMatched ? matchedReference : "Unmatched";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={busy}
					className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] font-mono hover:opacity-80 transition ${pillClass} ${busy ? "opacity-60" : ""}`}
					title={
						isMatched
							? `Matched to ${matchedReference} (${matchedInvoiceStatus ?? "paid"})`
							: "Click for matching options"
					}
				>
					{busy ? "…" : label}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-40">
				{isMatched && (
					<>
						<DropdownMenuItem onClick={unmatch}>Unmatch</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem onClick={rematch}>
					{isMatched ? "Rematch" : "Try matching"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
