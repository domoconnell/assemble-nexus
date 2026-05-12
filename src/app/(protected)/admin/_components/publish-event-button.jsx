"use client";

import { useTransition } from "react";
import { publishEventAction } from "../events/actions";

export default function PublishEventButton({ eventId }) {
	const [isPending, startTransition] = useTransition();
	return (
		<button
			type="button"
			disabled={isPending}
			onClick={(ev) => {
				ev.stopPropagation();
				ev.preventDefault();
				startTransition(async () => {
					await publishEventAction(eventId);
				});
			}}
			className="shrink-0 inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-primary hover:bg-primary/20 transition disabled:opacity-50"
		>
			{isPending ? "Publishing…" : "Publish"}
		</button>
	);
}
