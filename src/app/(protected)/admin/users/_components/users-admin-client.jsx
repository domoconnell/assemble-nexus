"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/shadcn/components/ui/dialog";
import ConfirmDialog from "@/global/ui/components/confirm-dialog";
import {
	updateUserEmailSubscriptionsAction,
	addAdminAction,
	removeAdminRoleAction,
	resendWelcomeAction,
} from "../actions";

function isSubscribed(subs, key) {
	return subs?.[key] !== false; // default opt-in
}

export default function UsersAdminClient({ admins, types }) {
	const [addOpen, setAddOpen] = useState(false);

	return (
		<>
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div className="text-sm text-muted-foreground">
					{admins.length} admin{admins.length === 1 ? "" : "s"}
				</div>
				<Button onClick={() => setAddOpen(true)}>+ Add admin</Button>
			</div>

			{admins.length === 0 ? (
				<div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground text-center">
					No admins yet. Click <em>Add admin</em> to invite one.
				</div>
			) : (
				<div className="rounded-lg border bg-card overflow-x-auto">
					<table className="w-full text-sm">
						<thead className="bg-muted/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							<tr>
								<th className="text-left px-4 py-3">User</th>
								{types.map((t) => (
									<th
										key={t.key}
										className="text-center px-3 py-3"
										title={t.description}
									>
										{t.label}
									</th>
								))}
								<th className="text-right px-4 py-3 w-32">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-foreground/5">
							{admins.map((u) => (
								<AdminRow key={u.id} user={u} types={types} />
							))}
						</tbody>
					</table>
				</div>
			)}

			<AddAdminDialog open={addOpen} onOpenChange={setAddOpen} />
		</>
	);
}

function AdminRow({ user, types }) {
	const router = useRouter();
	const [subs, setSubs] = useState(user.email_subscriptions ?? {});
	const [pending, startTransition] = useTransition();
	const [confirmRemove, setConfirmRemove] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	function toggle(key, next) {
		const prev = subs;
		const updated = { ...prev, [key]: next };
		setSubs(updated);
		startTransition(async () => {
			try {
				await updateUserEmailSubscriptionsAction({
					user_id: user.id,
					subscriptions: updated,
				});
				toast.success("Saved");
				router.refresh();
			} catch (err) {
				setSubs(prev);
				toast.error(err?.message || "Could not save.");
			}
		});
	}

	async function remove() {
		try {
			await removeAdminRoleAction({ user_id: user.id });
			toast.success("Admin role removed.");
			setConfirmRemove(false);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not remove.");
		}
	}

	async function resend() {
		setMenuOpen(false);
		try {
			await resendWelcomeAction({ email: user.email });
			toast.success("Welcome email re-sent.");
		} catch (err) {
			toast.error(err?.message || "Could not send.");
		}
	}

	const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
	return (
		<tr className="hover:bg-muted/20">
			<td className="px-4 py-3">
				<div className="font-medium">{fullName || "—"}</div>
				<div className="text-xs text-muted-foreground">{user.email}</div>
				{!user.email_verified && (
					<div className="text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300 mt-1">
						Email not verified
					</div>
				)}
			</td>
			{types.map((t) => (
				<td key={t.key} className="px-3 py-3 text-center">
					<input
						type="checkbox"
						className="h-4 w-4 rounded border-foreground/30 cursor-pointer disabled:cursor-wait"
						checked={isSubscribed(subs, t.key)}
						disabled={pending}
						onChange={(e) => toggle(t.key, e.target.checked)}
						aria-label={`${user.email} - ${t.label}`}
					/>
				</td>
			))}
			<td className="px-4 py-3 text-right whitespace-nowrap">
				<Button size="sm" variant="ghost" onClick={resend} disabled={pending}>
					Resend welcome
				</Button>
				<Button
					size="sm"
					variant="ghost"
					className="text-destructive hover:text-destructive"
					onClick={() => setConfirmRemove(true)}
					disabled={pending}
				>
					Remove
				</Button>
			</td>
			<ConfirmDialog
				open={confirmRemove}
				onOpenChange={setConfirmRemove}
				title="Remove admin role from this user?"
				description="The user record stays - any other roles they have (hirer, delegate) remain too. They just stop being an admin."
				confirmLabel="Remove admin"
				destructive
				onConfirm={remove}
			/>
		</tr>
	);
}

function AddAdminDialog({ open, onOpenChange }) {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [sendWelcome, setSendWelcome] = useState(true);
	const [busy, setBusy] = useState(false);

	function reset() {
		setEmail("");
		setFirstName("");
		setLastName("");
		setSendWelcome(true);
	}

	async function submit(e) {
		e.preventDefault();
		setBusy(true);
		try {
			const res = await addAdminAction({
				email: email.trim(),
				first_name: firstName.trim(),
				last_name: lastName.trim() || null,
				send_welcome: sendWelcome,
			});
			if (res.created) {
				toast.success(sendWelcome ? "Admin created and welcome email sent." : "Admin created.");
			} else if (res.role_attached) {
				toast.success("Existing user promoted to admin.");
			} else {
				toast.info("Already an admin.");
			}
			if (res.welcome_error) {
				toast.error(`Welcome email failed: ${res.welcome_error}`);
			}
			reset();
			onOpenChange(false);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not add admin.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
			<DialogContent className="p-0 max-w-md gap-0">
				<DialogHeader className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 space-y-1.5">
					<DialogTitle>Add admin</DialogTitle>
					<DialogDescription>
						If a user already exists with this email (hirer, delegate, etc),
						we&apos;ll attach the admin role to that record. No duplicates.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4 px-6 sm:px-8 pb-6 sm:pb-8">
					<div className="space-y-1.5">
						<Label htmlFor="a-email">Email</Label>
						<Input
							id="a-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							autoFocus
						/>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor="a-fn">First name</Label>
							<Input
								id="a-fn"
								value={firstName}
								onChange={(e) => setFirstName(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="a-ln">Last name</Label>
							<Input
								id="a-ln"
								value={lastName}
								onChange={(e) => setLastName(e.target.value)}
							/>
						</div>
					</div>
					<label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer select-none">
						<input
							type="checkbox"
							checked={sendWelcome}
							onChange={(e) => setSendWelcome(e.target.checked)}
							className="mt-0.5"
						/>
						<span>
							Send a welcome email with a magic link they can use to sign in
							and set a password.
						</span>
					</label>
					<div className="flex justify-end gap-2 pt-2">
						<Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
							Cancel
						</Button>
						<Button type="submit" disabled={busy || !email || !firstName}>
							{busy ? "Adding…" : "Add admin"}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
