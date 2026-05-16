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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shadcn/components/ui/tabs";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/shadcn/components/ui/dialog";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import {
	saveContactAction,
	removeContactFromOrganisationAction,
	deleteOrganisationAction,
	saveOrganisationAction,
} from "../actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmt = (c) => gbp.format((c ?? 0) / 100);

const ROLES = [
	{ value: "primary_booker", label: "Primary booker" },
	{ value: "finance", label: "Finance" },
	{ value: "onsite", label: "On-site contact" },
	{ value: "director", label: "Director" },
	{ value: "other", label: "Other" },
];
const roleLabel = (k) => ROLES.find((r) => r.value === k)?.label ?? k;

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Europe/London",
});
const dateOnly = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});

function formatYmd(ymd) {
	if (!ymd) return "-";
	const [y, m, d] = ymd.split("-").map(Number);
	return dateOnly.format(new Date(Date.UTC(y, m - 1, d)));
}

export default function OrganisationDetailClient({
	organisation,
	balance,
	contacts,
	bookings,
	events,
	ticketOrders,
	expenses,
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [editingOrg, setEditingOrg] = useState(false);
	const [editingContact, setEditingContact] = useState(null);
	const [confirmRemoveContact, setConfirmRemoveContact] = useState(null);
	const [confirmDeleteOrg, setConfirmDeleteOrg] = useState(false);

	function openEditOrg() {
		setEditingOrg({
			id: organisation.id,
			name: organisation.name,
			kind: organisation.kind,
			notes: organisation.notes ?? "",
		});
	}
	function saveOrg(e) {
		e?.preventDefault();
		startTransition(async () => {
			try {
				await saveOrganisationAction({
					id: editingOrg.id,
					name: editingOrg.name,
					kind: editingOrg.kind,
					notes: editingOrg.notes || null,
				});
				toast.success("Saved");
				setEditingOrg(false);
			} catch (err) {
				toast.error(err?.message || "Couldn't save");
			}
		});
	}
	function deleteOrg() {
		startTransition(async () => {
			try {
				await deleteOrganisationAction(organisation.id);
				toast.success("Organisation removed");
				router.push("/admin/crm");
			} catch (err) {
				toast.error(err?.message || "Couldn't remove");
			}
		});
	}

	function openNewContact() {
		setEditingContact({
			id: null,
			first_name: "",
			last_name: "",
			email: "",
			phone: "",
			notes: "",
			role: "primary_booker",
		});
	}
	function openEditContact(c) {
		setEditingContact({
			id: c.id,
			first_name: c.first_name ?? "",
			last_name: c.last_name ?? "",
			email: c.email ?? "",
			phone: c.phone ?? "",
			notes: c.notes ?? "",
			role: c.role ?? "other",
		});
	}
	function saveContact(e) {
		e?.preventDefault();
		startTransition(async () => {
			try {
				await saveContactAction({
					id: editingContact.id,
					organisation_id: organisation.id,
					first_name: editingContact.first_name,
					last_name: editingContact.last_name || null,
					email: editingContact.email || null,
					phone: editingContact.phone || null,
					notes: editingContact.notes || null,
					role: editingContact.role,
				});
				toast.success("Saved");
				setEditingContact(null);
			} catch (err) {
				toast.error(err?.message || "Couldn't save");
			}
		});
	}
	function removeContact(contactId) {
		startTransition(async () => {
			try {
				await removeContactFromOrganisationAction({
					organisation_id: organisation.id,
					contact_id: contactId,
				});
				toast.success("Removed");
			} catch (err) {
				toast.error(err?.message || "Couldn't remove");
			}
			setConfirmRemoveContact(null);
		});
	}

	return (
		<>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-lg border bg-card p-5">
					<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
						They owe us
					</div>
					<div className={`mt-1 font-display text-2xl ${balance.they_owe_us_cents > 0 ? "text-amber-600" : ""}`}>
						{fmt(balance.they_owe_us_cents)}
					</div>
					<div className="text-xs text-muted-foreground mt-1">
						Outstanding hire balances on their bookings.
					</div>
				</div>
				<div className="rounded-lg border bg-card p-5">
					<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
						We owe them
					</div>
					<div className={`mt-1 font-display text-2xl ${balance.we_owe_them_cents > 0 ? "text-primary" : ""}`}>
						{fmt(balance.we_owe_them_cents)}
					</div>
					<div className="text-xs text-muted-foreground mt-1">
						Organiser net from tickets (after fees + payouts).
					</div>
				</div>
			</div>

			<Tabs defaultValue="overview" className="space-y-6">
				<TabsList className="flex flex-wrap items-center gap-1">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
					<TabsTrigger value="bookings">Bookings ({bookings.length})</TabsTrigger>
					<TabsTrigger value="events">Events ({events.length})</TabsTrigger>
					<TabsTrigger value="tickets">Ticket orders ({ticketOrders.length})</TabsTrigger>
					<TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
				</TabsList>

				<TabsContent value="overview" className="space-y-5">
					<section className="rounded-lg border bg-card p-6 space-y-3">
						<div className="flex items-baseline justify-between">
							<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
								Notes
							</h2>
							<Button size="sm" variant="ghost" onClick={openEditOrg}>Edit</Button>
						</div>
						<p className="text-sm whitespace-pre-line">
							{organisation.notes || <span className="text-muted-foreground italic">No notes yet.</span>}
						</p>
					</section>

					<section className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-3">
						<h2 className="text-sm uppercase tracking-[0.2em] text-destructive">Danger zone</h2>
						<p className="text-sm text-foreground/80">
							Removing the organisation soft-deletes it. Linked bookings, events,
							expenses, and contacts remain - they just lose the org link.
						</p>
						<Button variant="outline" onClick={() => setConfirmDeleteOrg(true)}>
							Remove organisation
						</Button>
					</section>
				</TabsContent>

				<TabsContent value="contacts" className="space-y-4">
					<div className="flex justify-end">
						<Button onClick={openNewContact}>+ Add contact</Button>
					</div>
					{contacts.length === 0 ? (
						<div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
							No contacts yet.
						</div>
					) : (
						<div className="rounded-lg border bg-card overflow-hidden">
							<table className="w-full text-sm">
								<thead className="bg-muted/40 text-left">
									<tr>
										<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.18em] text-muted-foreground">Name</th>
										<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.18em] text-muted-foreground">Role</th>
										<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.18em] text-muted-foreground">Email</th>
										<th className="px-4 py-2 font-normal text-xs uppercase tracking-[0.18em] text-muted-foreground">Phone</th>
										<th className="px-2 py-2" />
									</tr>
								</thead>
								<tbody>
									{contacts.map((c) => (
										<tr key={c.id} className="border-t border-foreground/5">
											<td className="px-4 py-2">
												{c.first_name} {c.last_name}
											</td>
											<td className="px-4 py-2 text-muted-foreground">{roleLabel(c.role)}</td>
											<td className="px-4 py-2">{c.email || "-"}</td>
											<td className="px-4 py-2 text-muted-foreground">{c.phone || "-"}</td>
											<td className="px-2 py-2 text-right whitespace-nowrap">
												<Button variant="ghost" size="sm" onClick={() => openEditContact(c)}>
													Edit
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setConfirmRemoveContact(c.id)}
													disabled={pending}
												>
													Remove
												</Button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</TabsContent>

				<TabsContent value="bookings">
					<ListTable
						emptyMessage="No bookings linked to this organisation yet."
						headers={["Reference", "Status", "Total", "Outstanding", "Submitted"]}
						rows={bookings.map((b) => {
							const outstanding = Math.max(
								0,
								(b.total_cents ?? 0) -
									(b.deposit_paid_cents ?? 0) -
									(b.balance_paid_cents ?? 0),
							);
							return [
								<Link href={`/admin/bookings/${b.id}`} className="font-mono text-xs hover:underline">
									{b.reference}
								</Link>,
								<span className="text-muted-foreground capitalize">{b.status}</span>,
								fmt(b.total_cents),
								outstanding > 0 ? <span className="text-amber-600 font-mono">{fmt(outstanding)}</span> : <span className="text-muted-foreground">-</span>,
								b.submitted_at ? dateFmt.format(new Date(b.submitted_at)) : "-",
							];
						})}
					/>
				</TabsContent>

				<TabsContent value="events">
					<ListTable
						emptyMessage="No events organised by this organisation yet."
						headers={["Event", "Status", "Starts"]}
						rows={events.map((e) => [
							<Link href={`/admin/events/${e.id}`} className="hover:underline">
								{e.title}
							</Link>,
							<span className="text-muted-foreground capitalize">{e.status}</span>,
							e.starts_at ? dateFmt.format(new Date(e.starts_at)) : "-",
						])}
					/>
				</TabsContent>

				<TabsContent value="tickets">
					<ListTable
						emptyMessage="No ticket orders linked to this organisation yet."
						headers={["Reference", "Status", "Total", "Paid at"]}
						rows={ticketOrders.map((t) => [
							<Link href={`/admin/events/${t.event_id}/orders/${t.id}`} className="font-mono text-xs hover:underline">
								{t.reference}
							</Link>,
							<span className="text-muted-foreground capitalize">{t.status}</span>,
							fmt(t.total_cents),
							t.paid_at ? dateFmt.format(new Date(t.paid_at)) : "-",
						])}
					/>
				</TabsContent>

				<TabsContent value="expenses">
					<ListTable
						emptyMessage="No expenses paid to this organisation yet."
						headers={["Date", "Description", "Amount"]}
						rows={expenses.map((e) => [
							formatYmd(e.date),
							e.description,
							fmt(e.amount_cents),
						])}
					/>
				</TabsContent>
			</Tabs>

			<Dialog open={!!editingOrg} onOpenChange={(o) => !o && setEditingOrg(false)}>
				<DialogContent className="p-0 max-w-md gap-0">
					<DialogHeader className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 space-y-1.5">
						<DialogTitle>Edit organisation</DialogTitle>
						<DialogDescription>Name, kind, and free-form notes.</DialogDescription>
					</DialogHeader>
					{editingOrg && (
						<form onSubmit={saveOrg} className="space-y-4 px-6 sm:px-8 pb-6 sm:pb-8">
							<div className="space-y-1.5">
								<Label htmlFor="o-name">Name</Label>
								<Input
									id="o-name"
									value={editingOrg.name}
									onChange={(e) => setEditingOrg({ ...editingOrg, name: e.target.value })}
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label>Kind</Label>
								<Select
									value={editingOrg.kind}
									onValueChange={(v) => setEditingOrg({ ...editingOrg, kind: v })}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="church">Church</SelectItem>
										<SelectItem value="business">Business</SelectItem>
										<SelectItem value="charity">Charity</SelectItem>
										<SelectItem value="individual">Individual</SelectItem>
										<SelectItem value="other">Other</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="o-notes">Notes</Label>
								<Textarea
									id="o-notes"
									rows={4}
									value={editingOrg.notes}
									onChange={(e) => setEditingOrg({ ...editingOrg, notes: e.target.value })}
								/>
							</div>
							<div className="flex justify-end gap-2 pt-2">
								<Button type="button" variant="ghost" onClick={() => setEditingOrg(false)}>Cancel</Button>
								<Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
							</div>
						</form>
					)}
				</DialogContent>
			</Dialog>

			<Dialog open={!!editingContact} onOpenChange={(o) => !o && setEditingContact(null)}>
				<DialogContent className="p-0 max-w-md gap-0">
					<DialogHeader className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 space-y-1.5">
						<DialogTitle>{editingContact?.id ? "Edit contact" : "Add contact"}</DialogTitle>
						<DialogDescription>
							A person who acts on behalf of this organisation.
						</DialogDescription>
					</DialogHeader>
					{editingContact && (
						<form onSubmit={saveContact} className="space-y-4 px-6 sm:px-8 pb-6 sm:pb-8">
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label htmlFor="c-fn">First name</Label>
									<Input
										id="c-fn"
										value={editingContact.first_name}
										onChange={(e) => setEditingContact({ ...editingContact, first_name: e.target.value })}
										required
										autoFocus
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="c-ln">Last name</Label>
									<Input
										id="c-ln"
										value={editingContact.last_name}
										onChange={(e) => setEditingContact({ ...editingContact, last_name: e.target.value })}
									/>
								</div>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="c-email">Email</Label>
								<Input
									id="c-email"
									type="email"
									value={editingContact.email}
									onChange={(e) => setEditingContact({ ...editingContact, email: e.target.value })}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="c-phone">Phone</Label>
								<Input
									id="c-phone"
									value={editingContact.phone}
									onChange={(e) => setEditingContact({ ...editingContact, phone: e.target.value })}
								/>
							</div>
							<div className="space-y-1.5">
								<Label>Role</Label>
								<Select
									value={editingContact.role}
									onValueChange={(v) => setEditingContact({ ...editingContact, role: v })}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ROLES.map((r) => (
											<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="c-notes">Notes (optional)</Label>
								<Textarea
									id="c-notes"
									rows={3}
									value={editingContact.notes}
									onChange={(e) => setEditingContact({ ...editingContact, notes: e.target.value })}
								/>
							</div>
							<div className="flex justify-end gap-2 pt-2">
								<Button type="button" variant="ghost" onClick={() => setEditingContact(null)}>Cancel</Button>
								<Button type="submit" disabled={pending}>
									{pending ? "Saving…" : editingContact.id ? "Save" : "Add"}
								</Button>
							</div>
						</form>
					)}
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={!!confirmRemoveContact}
				onOpenChange={(o) => !o && setConfirmRemoveContact(null)}
				title="Remove this contact from the organisation?"
				description="The contact record stays in your CRM; only their link to this organisation is removed."
				confirmLabel="Remove"
				destructive
				onConfirm={() => confirmRemoveContact && removeContact(confirmRemoveContact)}
			/>

			<ConfirmDialog
				open={confirmDeleteOrg}
				onOpenChange={setConfirmDeleteOrg}
				title="Remove this organisation?"
				description="Soft-deletes the organisation. Linked records remain but lose the org link."
				confirmLabel="Remove organisation"
				destructive
				onConfirm={deleteOrg}
			/>
		</>
	);
}

function ListTable({ headers, rows, emptyMessage }) {
	if (!rows.length) {
		return (
			<div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
				{emptyMessage}
			</div>
		);
	}
	return (
		<div className="rounded-lg border bg-card overflow-hidden">
			<table className="w-full text-sm">
				<thead className="bg-muted/40 text-left">
					<tr>
						{headers.map((h, i) => (
							<th
								key={h}
								className={`px-4 py-2 font-normal text-xs uppercase tracking-[0.18em] text-muted-foreground ${
									i >= 2 ? "text-right" : ""
								}`}
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((cells, i) => (
						<tr key={i} className="border-t border-foreground/5">
							{cells.map((c, j) => (
								<td key={j} className={`px-4 py-2 ${j >= 2 ? "text-right" : ""}`}>
									{c}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
