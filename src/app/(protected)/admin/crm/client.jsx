"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Label } from "@/shadcn/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shadcn/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/shadcn/components/ui/dialog";
import { saveOrganisationAction } from "./actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const KINDS = [
	{ value: "church", label: "Church" },
	{ value: "business", label: "Business" },
	{ value: "charity", label: "Charity" },
	{ value: "individual", label: "Individual" },
	{ value: "other", label: "Other" },
];
const kindLabel = (k) => KINDS.find((x) => x.value === k)?.label ?? k;

export default function CrmListClient({ organisations }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [editing, setEditing] = useState(null);

	function openNew() {
		setEditing({ id: null, name: "", kind: "business", notes: "" });
	}

	function save(e) {
		e?.preventDefault();
		if (!editing) return;
		startTransition(async () => {
			try {
				const res = await saveOrganisationAction({
					id: editing.id,
					name: editing.name,
					kind: editing.kind,
					notes: editing.notes || null,
				});
				toast.success(editing.id ? "Saved" : "Organisation added");
				setEditing(null);
				if (!editing.id && res?.id) router.push(`/admin/crm/${res.id}`);
			} catch (err) {
				toast.error(err?.message || "Couldn't save");
			}
		});
	}

	return (
		<>
			<div className="flex justify-between items-baseline gap-3">
				<span className="text-sm text-muted-foreground">
					{organisations.length} organisation{organisations.length === 1 ? "" : "s"}
				</span>
				<Button onClick={openNew}>+ Add organisation</Button>
			</div>

			{organisations.length === 0 ? (
				<div className="rounded-lg border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
					No organisations yet. Add a hirer or organiser to start tracking
					their bookings, events, and balances together.
				</div>
			) : (
				<div className="rounded-lg border bg-card overflow-x-auto">
					<table className="w-full text-sm">
						<thead className="bg-muted/40">
							<tr className="text-left">
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">Name</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground">Kind</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground text-right">They owe us</th>
								<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.2em] text-muted-foreground text-right">We owe them</th>
							</tr>
						</thead>
						<tbody>
							{organisations.map((o) => (
								<tr key={o.id} className="border-t border-foreground/5 hover:bg-muted/30">
									<td className="px-4 py-2">
										<Link href={`/admin/crm/${o.id}`} className="hover:underline">
											{o.name}
										</Link>
									</td>
									<td className="px-4 py-2 text-muted-foreground">{kindLabel(o.kind)}</td>
									<td className={`px-4 py-2 text-right font-mono whitespace-nowrap ${o.they_owe_us_cents > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
										{fmt(o.they_owe_us_cents)}
									</td>
									<td className={`px-4 py-2 text-right font-mono whitespace-nowrap ${o.we_owe_them_cents > 0 ? "text-primary" : "text-muted-foreground"}`}>
										{fmt(o.we_owe_them_cents)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
				<DialogContent className="p-0 max-w-md gap-0">
					<DialogHeader className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 space-y-1.5">
						<DialogTitle>{editing?.id ? "Edit organisation" : "Add organisation"}</DialogTitle>
						<DialogDescription>
							A counterparty you do ongoing business with - a church, business, or charity.
						</DialogDescription>
					</DialogHeader>
					{editing && (
						<form onSubmit={save} className="space-y-4 px-6 sm:px-8 pb-6 sm:pb-8">
							<div className="space-y-1.5">
								<Label htmlFor="org-name">Name</Label>
								<Input
									id="org-name"
									value={editing.name}
									onChange={(e) => setEditing({ ...editing, name: e.target.value })}
									required
									autoFocus
								/>
							</div>
							<div className="space-y-1.5">
								<Label>Kind</Label>
								<Select
									value={editing.kind}
									onValueChange={(v) => setEditing({ ...editing, kind: v })}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{KINDS.map((k) => (
											<SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="org-notes">Notes (optional)</Label>
								<Textarea
									id="org-notes"
									rows={3}
									value={editing.notes}
									onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
								/>
							</div>
							<div className="flex justify-end gap-2 pt-2">
								<Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
								<Button type="submit" disabled={pending}>
									{pending ? "Saving…" : editing.id ? "Save" : "Add"}
								</Button>
							</div>
						</form>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
