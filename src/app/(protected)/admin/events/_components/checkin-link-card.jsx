"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import {
	ensureEventCheckinCodeAction,
	rotateEventCheckinCodeAction,
} from "../actions";

export default function CheckinLinkCard({ eventId, initialCheckinCode }) {
	const [code, setCode] = useState(initialCheckinCode ?? null);
	const [origin, setOrigin] = useState("");
	const [confirmRotate, setConfirmRotate] = useState(false);
	const [pending, startTransition] = useTransition();

	useEffect(() => {
		if (typeof window !== "undefined") setOrigin(window.location.origin);
	}, []);

	const url = code ? `${origin}/checkin/${code}` : null;

	async function copyUrl() {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			toast.success("Check-in link copied");
		} catch {
			toast.error("Couldn't copy — long-press to copy manually");
		}
	}

	function ensure() {
		startTransition(async () => {
			const res = await ensureEventCheckinCodeAction(eventId);
			setCode(res.checkin_code);
		});
	}

	function rotate() {
		startTransition(async () => {
			const res = await rotateEventCheckinCodeAction(eventId);
			setCode(res.checkin_code);
			toast.success("New link generated — old one is now invalid");
		});
	}

	return (
		<section className="rounded-lg border bg-card p-6 space-y-3">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					Door check-in link
				</h2>
				{code && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setConfirmRotate(true)}
						disabled={pending}
					>
						Rotate
					</Button>
				)}
			</div>

			<p className="text-sm text-muted-foreground">
				Anyone with this link can check tickets in — no login needed. Share it with whoever's on the door.
			</p>

			{!code ? (
				<Button type="button" onClick={ensure} disabled={pending}>
					Generate link
				</Button>
			) : (
				<div className="space-y-2">
					<div className="rounded-md border bg-background px-3 py-2 font-mono text-sm break-all">
						{url ?? `…/checkin/${code}`}
					</div>
					<div className="flex gap-2">
						<Button type="button" size="sm" onClick={copyUrl} disabled={!url}>
							Copy link
						</Button>
						{url && (
							<Button asChild type="button" size="sm" variant="outline">
								<a href={url} target="_blank" rel="noreferrer">
									Open scanner
								</a>
							</Button>
						)}
					</div>
				</div>
			)}

			<ConfirmDialog
				open={confirmRotate}
				onOpenChange={setConfirmRotate}
				title="Rotate check-in link?"
				description="The current link will stop working immediately. Anyone using it on the door will need the new one."
				confirmLabel="Rotate link"
				destructive
				onConfirm={rotate}
			/>
		</section>
	);
}
