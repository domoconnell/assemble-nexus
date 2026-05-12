"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Label } from "@/shadcn/components/ui/label";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import { saveBookingTypeAction, deleteBookingTypeAction } from "../actions";

function emptyType() {
	return {
		id: null,
		key: "",
		label: "",
		description: "",
		default_rate_modifier_x100: 10000,
		sort_order: 0,
	};
}

export default function BookingTypesEditor({ initialTypes }) {
	const router = useRouter();
	const [types, setTypes] = useState(initialTypes);
	const [editing, setEditing] = useState(null);
	const [error, setError] = useState(null);
	const [confirmDelete, setConfirmDelete] = useState(null); // type id or null

	function startNew() {
		setEditing(emptyType());
		setError(null);
	}

	function startEdit(t) {
		setEditing({ ...t, description: t.description ?? "" });
		setError(null);
	}

	function update(field, value) {
		setEditing((e) => ({ ...e, [field]: value }));
	}

	async function save() {
		setError(null);
		try {
			const saved = await saveBookingTypeAction(editing);
			setTypes((xs) => {
				const exists = xs.some((x) => x.id === saved.id);
				return exists
					? xs.map((x) => (x.id === saved.id ? saved : x))
					: [...xs, saved].sort((a, b) => a.sort_order - b.sort_order);
			});
			setEditing(null);
			router.refresh();
		} catch (err) {
			setError(err?.message || "Save failed");
		}
	}

	async function performDelete(id) {
		await deleteBookingTypeAction(id);
		setTypes((xs) => xs.filter((x) => x.id !== id));
	}

	return (
		<div className="space-y-6">
			<div className="rounded-lg border bg-card">
				<table className="w-full text-sm">
					<thead className="border-b text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
						<tr>
							<th className="px-4 py-3 font-medium">Label</th>
							<th className="px-4 py-3 font-medium">Key</th>
							<th className="px-4 py-3 font-medium">Modifier</th>
							<th className="px-4 py-3 font-medium">Order</th>
							<th className="px-4 py-3"></th>
						</tr>
					</thead>
					<tbody>
						{types.length === 0 && (
							<tr>
								<td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
									No booking types yet.
								</td>
							</tr>
						)}
						{types.map((t) => (
							<tr key={t.id} className="border-b last:border-b-0">
								<td className="px-4 py-3 font-medium">{t.label}</td>
								<td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.key}</td>
								<td className="px-4 py-3 text-muted-foreground">
									{(t.default_rate_modifier_x100 / 100).toFixed(0)}%
								</td>
								<td className="px-4 py-3 text-muted-foreground">{t.sort_order}</td>
								<td className="px-4 py-3 text-right space-x-2">
									<Button variant="ghost" size="sm" onClick={() => startEdit(t)}>
										Edit
									</Button>
									<Button variant="ghost" size="sm" onClick={() => setConfirmDelete(t.id)}>
										Delete
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{!editing && (
				<Button onClick={startNew}>+ New booking type</Button>
			)}

			{editing && (
				<div className="rounded-lg border bg-card p-6 space-y-5">
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
						{editing.id ? "Edit type" : "New type"}
					</h2>
					{error && (
						<div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
							{error}
						</div>
					)}
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="label">Label</Label>
							<Input id="label" value={editing.label} onChange={(e) => update("label", e.target.value)} />
						</div>
						<div className="space-y-2">
							<Label htmlFor="key">Key</Label>
							<Input id="key" value={editing.key} onChange={(e) => update("key", e.target.value)} placeholder="event_day" />
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="description">Description</Label>
							<Textarea id="description" rows={2} value={editing.description ?? ""} onChange={(e) => update("description", e.target.value)} />
						</div>
						<div className="space-y-2">
							<Label htmlFor="modifier">Default rate modifier (%)</Label>
							<Input
								id="modifier"
								type="number"
								min="0"
								max="500"
								step="1"
								value={Math.round(editing.default_rate_modifier_x100 / 100)}
								onChange={(e) => update("default_rate_modifier_x100", Math.round(Number(e.target.value || 0) * 100))}
							/>
							<p className="text-xs text-muted-foreground">100 = full rate. 50 = half rate. 125 = +25%.</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="sort_order">Sort order</Label>
							<Input id="sort_order" type="number" value={editing.sort_order} onChange={(e) => update("sort_order", e.target.value)} />
						</div>
					</div>
					<div className="flex gap-2 justify-end">
						<Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
						<Button onClick={save} disabled={!editing.label || !editing.key}>Save</Button>
					</div>
				</div>
			)}

			<ConfirmDialog
				open={confirmDelete !== null}
				onOpenChange={(v) => !v && setConfirmDelete(null)}
				title="Delete this booking type?"
				description="Existing bookings keep their snapshotted type; new bookings won't be able to use it."
				confirmLabel="Delete booking type"
				destructive
				onConfirm={async () => {
					const id = confirmDelete;
					if (!id) return;
					await performDelete(id);
					setConfirmDelete(null);
				}}
			/>
		</div>
	);
}
