"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Label } from "@/shadcn/components/ui/label";
import { Checkbox } from "@/shadcn/components/ui/checkbox";
import { Badge } from "@/shadcn/components/ui/badge";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import { saveDiscountAction, deleteDiscountAction } from "../actions";

function emptyDiscount() {
	return {
		id: null,
		label: "",
		description: "",
		percent_x100: 1000,
		sort_order: 0,
		is_active: true,
	};
}

export default function DiscountsEditor({ initialDiscounts }) {
	const router = useRouter();
	const [discounts, setDiscounts] = useState(initialDiscounts);
	const [editing, setEditing] = useState(null);
	const [error, setError] = useState(null);
	const [confirmDelete, setConfirmDelete] = useState(null);

	function startNew() {
		setEditing(emptyDiscount());
		setError(null);
	}

	function startEdit(d) {
		setEditing({
			id: d.id,
			label: d.label ?? "",
			description: d.description ?? "",
			percent_x100: d.percent_x100,
			sort_order: d.sort_order ?? 0,
			is_active: d.is_active !== false,
		});
		setError(null);
	}

	function update(field, value) {
		setEditing((e) => ({ ...e, [field]: value }));
	}

	async function save() {
		setError(null);
		try {
			const saved = await saveDiscountAction(editing);
			setDiscounts((xs) => {
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
		await deleteDiscountAction(id);
		setDiscounts((xs) => xs.filter((x) => x.id !== id));
	}

	return (
		<div className="space-y-6">
			<div className="rounded-lg border bg-card">
				<table className="w-full text-sm">
					<thead className="border-b text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
						<tr>
							<th className="px-4 py-3 font-medium">Label</th>
							<th className="px-4 py-3 font-medium">Discount</th>
							<th className="px-4 py-3 font-medium">Status</th>
							<th className="px-4 py-3 font-medium">Order</th>
							<th className="px-4 py-3"></th>
						</tr>
					</thead>
					<tbody>
						{discounts.length === 0 && (
							<tr>
								<td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
									No discounts yet.
								</td>
							</tr>
						)}
						{discounts.map((d) => (
							<tr key={d.id} className="border-b last:border-b-0">
								<td className="px-4 py-3">
									<div className="font-medium">{d.label}</div>
									{d.description && (
										<div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
											{d.description}
										</div>
									)}
								</td>
								<td className="px-4 py-3 font-mono text-xs">
									{(d.percent_x100 / 100).toFixed(0)}%
								</td>
								<td className="px-4 py-3">
									{d.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Hidden</Badge>}
								</td>
								<td className="px-4 py-3 text-muted-foreground">{d.sort_order}</td>
								<td className="px-4 py-3 text-right space-x-2">
									<Button variant="ghost" size="sm" onClick={() => startEdit(d)}>
										Edit
									</Button>
									<Button variant="ghost" size="sm" onClick={() => setConfirmDelete(d.id)}>
										Delete
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{!editing && <Button onClick={startNew}>+ New discount</Button>}

			{editing && (
				<div className="rounded-lg border bg-card p-6 space-y-5">
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
						{editing.id ? "Edit discount" : "New discount"}
					</h2>
					{error && (
						<div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
							{error}
						</div>
					)}
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="label">Label</Label>
							<Input
								id="label"
								value={editing.label}
								onChange={(e) => update("label", e.target.value)}
								placeholder="e.g. Local Newark business"
							/>
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="description">Description</Label>
							<Textarea
								id="description"
								rows={2}
								value={editing.description ?? ""}
								onChange={(e) => update("description", e.target.value)}
								placeholder="Shown to customers when they pick this discount."
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="percent">Discount (%)</Label>
							<Input
								id="percent"
								type="number"
								min="0"
								max="100"
								step="0.5"
								value={(editing.percent_x100 / 100).toString()}
								onChange={(e) => update("percent_x100", Math.round(Number(e.target.value || 0) * 100))}
							/>
							<p className="text-xs text-muted-foreground">Applied to room hire only - not to add-ons.</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="sort_order">Sort order</Label>
							<Input
								id="sort_order"
								type="number"
								value={editing.sort_order ?? 0}
								onChange={(e) => update("sort_order", e.target.value)}
							/>
						</div>
						<div className="flex items-end gap-2 pb-1 sm:col-span-2">
							<Checkbox
								id="is_active"
								checked={!!editing.is_active}
								onCheckedChange={(v) => update("is_active", !!v)}
							/>
							<Label htmlFor="is_active">Available to customers</Label>
						</div>
					</div>
					<div className="flex gap-2 justify-end">
						<Button variant="outline" onClick={() => setEditing(null)}>
							Cancel
						</Button>
						<Button onClick={save} disabled={!editing.label}>
							Save
						</Button>
					</div>
				</div>
			)}

			<ConfirmDialog
				open={confirmDelete !== null}
				onOpenChange={(v) => !v && setConfirmDelete(null)}
				title="Delete this discount?"
				description="Existing bookings keep their snapshotted discount; new bookings won't see it."
				confirmLabel="Delete discount"
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
