"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Toggle pill for showing / hiding individual Stripe + Square card-swipe
 * income from the transactions list. Persists the choice in a cookie so
 * the server-side query can apply the filter on its next render, and
 * uses `router.refresh()` (not a navigation) so the scroll position is
 * preserved and no URL param shows up.
 */
export default function PspIncomeToggle({ initial = false }) {
	const router = useRouter();
	const [shown, setShown] = useState(Boolean(initial));
	const [pending, startTransition] = useTransition();

	function toggle() {
		const next = !shown;
		setShown(next);
		// 1-year cookie scoped to the whole app. Path=/ so it applies on
		// every banking-page render; SameSite=Lax so it survives normal
		// in-app navigation. The server reads it via cookies() in page.jsx.
		const oneYear = 60 * 60 * 24 * 365;
		document.cookie = `psp_income_shown=${next ? "1" : "0"}; Path=/; Max-Age=${oneYear}; SameSite=Lax`;
		startTransition(() => router.refresh());
	}

	return (
		<button
			type="button"
			onClick={toggle}
			disabled={pending}
			title={
				shown
					? "Hide individual Stripe / Square card-swipe income from this list."
					: "Show every individual Stripe / Square card-swipe in the list."
			}
			className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] hover:border-primary/40 transition disabled:opacity-60 ${
				shown
					? "border-primary/30 bg-primary/10 text-primary"
					: "border-foreground/15 bg-card text-muted-foreground"
			}`}
		>
			{pending ? "…" : shown ? "PSP income · shown" : "PSP income · hidden"}
		</button>
	);
}
