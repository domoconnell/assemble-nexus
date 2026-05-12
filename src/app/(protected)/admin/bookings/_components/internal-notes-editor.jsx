"use client";

import { useState } from "react";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Button } from "@/shadcn/components/ui/button";
import { saveBookingInternalNotesAction } from "../actions";

export default function InternalNotesEditor({ bookingId, initialValue }) {
	const [value, setValue] = useState(initialValue ?? "");
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState(null);

	async function save() {
		setSaving(true);
		try {
			await saveBookingInternalNotesAction({
				booking_id: bookingId,
				internal_notes: value,
			});
			setSavedAt(new Date());
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="rounded-lg border bg-card p-6 space-y-3">
			<div className="flex items-center justify-between gap-4">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					Internal notes
				</h2>
				{savedAt && (
					<span className="text-xs text-muted-foreground">Saved.</span>
				)}
			</div>
			<Textarea
				rows={4}
				placeholder="Notes for the team. Not visible to the customer."
				value={value}
				onChange={(e) => setValue(e.target.value)}
			/>
			<div className="flex justify-end">
				<Button size="sm" onClick={save} disabled={saving}>
					{saving ? "Saving…" : "Save notes"}
				</Button>
			</div>
		</section>
	);
}
