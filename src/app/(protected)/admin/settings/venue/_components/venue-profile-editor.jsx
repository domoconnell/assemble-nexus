"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { saveVenueProfileAction } from "../actions";

export default function VenueProfileEditor({ initial }) {
	const router = useRouter();
	const [name, setName] = useState(initial?.name ?? "");
	const [saving, setSaving] = useState(false);

	async function save(e) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		setSaving(true);
		try {
			await saveVenueProfileAction({ name: trimmed });
			toast.success("Saved");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't save the venue name.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={save} className="rounded-lg border bg-card p-6 space-y-5">
			<div className="space-y-2">
				<Label htmlFor="venue-name">Venue name</Label>
				<Input
					id="venue-name"
					type="text"
					placeholder="The Assembly Rooms Newark"
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
					maxLength={200}
				/>
				<p className="text-xs text-muted-foreground">
					Used in every email signoff, the board pack PDF header, and any
					other place the platform refers to the venue by name.
				</p>
			</div>
			<div className="flex justify-end">
				<Button type="submit" disabled={saving || !name.trim()}>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</form>
	);
}
