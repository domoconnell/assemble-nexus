"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Displays a public URL (anchored to the current window's origin) with
 * a one-click copy button and an external-link affordance. Server pages
 * pass a path; we resolve the origin client-side so it works in dev,
 * prod, and across hostnames without baked-in BASE_URL config.
 */
export function CopyableUrl({ path, label = "Public link" }) {
	const [origin, setOrigin] = useState("");
	useEffect(() => {
		if (typeof window !== "undefined") setOrigin(window.location.origin);
	}, []);

	const fullUrl = `${origin}${path}`;
	const displayUrl = fullUrl.replace(/^https?:\/\//, "");

	async function copy() {
		try {
			await navigator.clipboard.writeText(fullUrl);
			toast.success("Link copied");
		} catch {
			toast.error("Copy failed — long-press the link to share manually.");
		}
	}

	return (
		<div className="rounded-lg border border-foreground/10 bg-card p-3 flex items-center gap-3 text-sm">
			<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground shrink-0">
				{label}
			</div>
			<a
				href={path}
				target="_blank"
				rel="noreferrer"
				className="font-mono text-xs text-foreground/85 truncate min-w-0 flex-1 hover:text-primary transition"
				title={fullUrl}
			>
				{displayUrl || path}
			</a>
			<button
				type="button"
				onClick={copy}
				className="shrink-0 rounded-md border border-foreground/15 px-2.5 py-1 text-xs hover:border-primary/40 hover:bg-primary/5 transition"
			>
				Copy
			</button>
			<a
				href={path}
				target="_blank"
				rel="noreferrer"
				className="shrink-0 text-xs text-primary hover:underline whitespace-nowrap"
			>
				Open ↗
			</a>
		</div>
	);
}
