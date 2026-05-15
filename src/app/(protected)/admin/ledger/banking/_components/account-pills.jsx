"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Multi-select pills filtering every metric on the Banking page by bank
 * account. Selection lives in `?accounts=id1,id2`; omitting the param OR
 * selecting every account means "all" (server treats null as no filter).
 */
export default function AccountPills({ accounts, selectedIds }) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const selected = useMemo(
		() => new Set(selectedIds ?? accounts.map((a) => a.id)),
		[selectedIds, accounts],
	);

	function setSelection(nextIds) {
		const params = new URLSearchParams(searchParams.toString());
		if (nextIds.length === 0 || nextIds.length === accounts.length) {
			params.delete("accounts");
		} else {
			params.set("accounts", nextIds.join(","));
		}
		// Reset pagination when the filter changes
		params.delete("page");
		const qs = params.toString();
		router.push(`/admin/ledger/banking${qs ? `?${qs}` : ""}`);
	}

	function toggle(id) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		// Empty selection auto-flips to "all" — at least one account must be on.
		const nextIds = next.size === 0 ? accounts.map((a) => a.id) : [...next];
		setSelection(nextIds);
	}

	function selectAll() {
		setSelection(accounts.map((a) => a.id));
	}

	const allSelected = selected.size === accounts.length;

	return (
		<div className="flex items-center gap-2 flex-wrap">
			<button
				type="button"
				onClick={selectAll}
				className={`px-3 py-1 rounded-full text-xs uppercase tracking-[0.15em] border transition ${
					allSelected
						? "border-primary/40 bg-primary/15 text-primary"
						: "border-foreground/15 bg-card text-muted-foreground hover:text-foreground"
				}`}
			>
				All
			</button>
			{accounts.map((a) => {
				const on = selected.has(a.id);
				return (
					<button
						key={a.id}
						type="button"
						onClick={() => toggle(a.id)}
						className={`px-3 py-1 rounded-full text-xs border transition ${
							on
								? "border-primary/40 bg-primary/15 text-primary"
								: "border-foreground/15 bg-card text-muted-foreground hover:text-foreground"
						}`}
					>
						{a.label}
					</button>
				);
			})}
		</div>
	);
}
