"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import SessionRow from "./session-row";
import { fillTenancySessionsAction } from "../actions";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

/**
 * Upcoming + recent past sessions for a tenancy. The "Fill sessions"
 * button triggers an idempotent materialisation against the line's
 * schedule — useful when the daily cron hasn't run yet (just-created
 * tenancy) or when an admin wants to refresh after editing the schedule.
 */
const UPCOMING_VISIBLE = 5;

export default function SessionsSection({ tenancyId, futureSessions, pastSessions }) {
	const router = useRouter();
	const [filling, setFilling] = useState(false);
	const [showAll, setShowAll] = useState(false);
	const upcomingShown = showAll
		? futureSessions
		: futureSessions.slice(0, UPCOMING_VISIBLE);
	const hiddenCount = Math.max(0, futureSessions.length - UPCOMING_VISIBLE);

	async function fill() {
		setFilling(true);
		try {
			const res = await fillTenancySessionsAction(tenancyId);
			if (res.inserted > 0) {
				toast.success(
					`Filled ${res.inserted} session${res.inserted === 1 ? "" : "s"}.`,
				);
			} else {
				toast.info("No new sessions to add — already up to date.");
			}
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not fill sessions.");
		} finally {
			setFilling(false);
		}
	}

	return (
		<section className="space-y-3">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Upcoming sessions · {futureSessions.length}
				</h2>
				<Button
					size="sm"
					variant="outline"
					onClick={fill}
					disabled={filling}
					title="Generate the next ~90 days of sessions from the tenancy schedule."
				>
					{filling ? "Filling…" : "Fill sessions based on tenancy"}
				</Button>
			</div>
			{futureSessions.length === 0 ? (
				<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
					No future sessions materialised yet. Click <em>Fill sessions based on tenancy</em>{" "}
					to generate them, or wait for the overnight cron.
				</div>
			) : (
				<>
					<ul className="rounded-lg border bg-card divide-y divide-foreground/10 overflow-hidden">
						{upcomingShown.map((s) => (
							<SessionRow key={s.id} session={s} dateFmt={dateFmt} />
						))}
					</ul>
					{hiddenCount > 0 && (
						<button
							type="button"
							onClick={() => setShowAll((v) => !v)}
							className="text-xs text-muted-foreground hover:text-foreground"
						>
							{showAll
								? `Show next ${UPCOMING_VISIBLE}`
								: `Show all ${futureSessions.length} →`}
						</button>
					)}
				</>
			)}

			{pastSessions.length > 0 && (
				<details className="rounded-lg border bg-card overflow-hidden">
					<summary className="px-4 py-3 text-sm cursor-pointer hover:bg-accent/30">
						Recent past sessions ({pastSessions.length})
					</summary>
					<ul className="divide-y divide-foreground/10">
						{pastSessions.map((s) => (
							<SessionRow key={s.id} session={s} dateFmt={dateFmt} muted />
						))}
					</ul>
				</details>
			)}
		</section>
	);
}
