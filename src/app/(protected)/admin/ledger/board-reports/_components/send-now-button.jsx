"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendBoardPackNowAction } from "../actions";

export default function SendNowButton({ ym, isResend }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [confirming, setConfirming] = useState(false);

	function trigger() {
		if (isResend && !confirming) {
			setConfirming(true);
			return;
		}
		setConfirming(false);
		startTransition(async () => {
			try {
				const result = await sendBoardPackNowAction({ ym });
				if (result?.skipped) {
					toast.info(`Skipped: ${result.skipped}`);
				} else if (result?.emails_failed > 0) {
					toast.warning(
						`Sent to ${result.emails_sent}, ${result.emails_failed} failed - check logs.`,
					);
				} else if ((result?.recipients_count ?? 0) === 0) {
					toast.warning(
						"PDF built and stored, but no recipients are configured.",
					);
				} else {
					toast.success(
						`Sent to ${result.emails_sent} recipient${result.emails_sent === 1 ? "" : "s"}.`,
					);
				}
				router.refresh();
			} catch (err) {
				toast.error(err?.message || "Send failed.");
			}
		});
	}

	const label = pending
		? "Sending…"
		: confirming
			? "Click again to confirm"
			: isResend
				? "Resend"
				: "Send now";

	const tone = confirming
		? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
		: isResend
			? "border-foreground/15 hover:border-foreground/30 text-muted-foreground hover:text-foreground"
			: "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10";

	return (
		<button
			type="button"
			onClick={trigger}
			disabled={pending}
			className={`rounded-md border px-3 py-1.5 text-sm transition ${tone} ${pending ? "opacity-50" : ""}`}
		>
			{label}
		</button>
	);
}
