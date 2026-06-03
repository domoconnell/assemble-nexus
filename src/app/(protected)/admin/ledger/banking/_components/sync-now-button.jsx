"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { runBankSyncAction } from "../actions";

export default function SyncNowButton() {
	const router = useRouter();
	const [busy, setBusy] = useState(false);

	async function sync() {
		setBusy(true);
		try {
			const result = await runBankSyncAction();
			const syncedAccounts = result?.sync?.length ?? 0;
			const matched = (result?.match ?? []).reduce(
				(s, v) => s + (v?.matched ?? 0),
				0,
			);
			const ambiguous = (result?.match ?? []).reduce(
				(s, v) => s + (v?.ambiguous ?? 0),
				0,
			);
			const pieces = [`${syncedAccounts} account${syncedAccounts === 1 ? "" : "s"} synced`];
			if (matched > 0) pieces.push(`${matched} invoice${matched === 1 ? "" : "s"} matched`);
			if (ambiguous > 0) pieces.push(`${ambiguous} ambiguous`);
			toast.success(pieces.join(" · "));
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Sync failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Button size="sm" variant="outline" onClick={sync} disabled={busy}>
			{busy ? "Syncing…" : "Sync now"}
		</Button>
	);
}
