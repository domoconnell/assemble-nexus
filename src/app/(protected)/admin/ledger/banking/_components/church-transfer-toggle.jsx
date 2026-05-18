"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setChurchTransferFlagAction } from "../actions";

export default function ChurchTransferToggle({ transactionId, initial }) {
	const [flagged, setFlagged] = useState(initial);
	const [pending, startTransition] = useTransition();
	const router = useRouter();

	function toggle() {
		const next = !flagged;
		setFlagged(next);
		startTransition(async () => {
			try {
				await setChurchTransferFlagAction({
					transaction_id: transactionId,
					is_church_transfer: next,
				});
				router.refresh();
			} catch {
				setFlagged(!next);
			}
		});
	}

	return (
		<button
			type="button"
			onClick={toggle}
			disabled={pending}
			className={`inline-flex items-center text-[10px] uppercase tracking-[0.15em] rounded-full border px-2 py-0.5 transition ${
				flagged
					? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
					: "border-foreground/15 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
			} ${pending ? "opacity-50" : ""}`}
			aria-pressed={flagged}
			title={flagged ? "Tagged as church transfer (click to untag)" : "Click to tag as church transfer"}
		>
			{flagged ? "Church transfer" : "Mark as church"}
		</button>
	);
}
