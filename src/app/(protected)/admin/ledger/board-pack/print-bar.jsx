"use client";

import Link from "next/link";
import { Button } from "@/shadcn/components/ui/button";

export default function BoardPackPrintBar({ ym, monthLabel }) {
	return (
		<div className="no-print sticky top-0 z-10 border-b border-foreground/10 bg-background/95 backdrop-blur px-6 py-3 flex items-baseline justify-between gap-4">
			<div className="flex items-baseline gap-4">
				<Link
					href={`/admin/ledger/overview?month=${ym}`}
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Back to ledger
				</Link>
				<span className="text-xs text-muted-foreground">{monthLabel}</span>
			</div>
			<Button onClick={() => window.print()}>Save as PDF / Print</Button>
		</div>
	);
}
