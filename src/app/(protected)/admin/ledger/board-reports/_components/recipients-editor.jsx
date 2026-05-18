"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import {
	addBoardReportRecipientAction,
	removeBoardReportRecipientAction,
} from "../actions";

export default function RecipientsEditor({ initial }) {
	const router = useRouter();
	const [recipients, setRecipients] = useState(initial?.recipients ?? []);
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [pending, startTransition] = useTransition();

	function add(e) {
		e.preventDefault();
		const trimmedEmail = email.trim();
		if (!trimmedEmail) return;
		startTransition(async () => {
			try {
				const next = await addBoardReportRecipientAction({
					email: trimmedEmail,
					name: name.trim() || null,
				});
				setRecipients(next.recipients);
				setEmail("");
				setName("");
				toast.success("Added");
				router.refresh();
			} catch (err) {
				toast.error(err?.message || "Couldn't add that recipient.");
			}
		});
	}

	function remove(targetEmail) {
		startTransition(async () => {
			try {
				const next = await removeBoardReportRecipientAction(targetEmail);
				setRecipients(next.recipients);
				toast.success("Removed");
				router.refresh();
			} catch (err) {
				toast.error(err?.message || "Couldn't remove that recipient.");
			}
		});
	}

	return (
		<div className="space-y-4">
			{recipients.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No recipients yet. Add at least one email before the monthly cron runs.
				</p>
			) : (
				<ul className="space-y-2">
					{recipients.map((r) => (
						<li
							key={r.email}
							className="flex items-baseline justify-between gap-3 rounded-md border bg-card px-3 py-2"
						>
							<div className="min-w-0 flex-1">
								<div className="text-sm font-medium truncate">
									{r.name || r.email}
								</div>
								{r.name && (
									<div className="text-xs text-muted-foreground truncate">
										{r.email}
									</div>
								)}
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => remove(r.email)}
								disabled={pending}
							>
								Remove
							</Button>
						</li>
					))}
				</ul>
			)}

			<form onSubmit={add} className="rounded-md border bg-card p-4 space-y-3">
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="recipient-email">Email</Label>
						<Input
							id="recipient-email"
							type="email"
							placeholder="trustee@church.org"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="recipient-name">Name (optional)</Label>
						<Input
							id="recipient-name"
							type="text"
							placeholder="J. Smith — Trustee"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
				</div>
				<div className="flex justify-end">
					<Button type="submit" disabled={pending || !email.trim()}>
						{pending ? "Saving…" : "Add recipient"}
					</Button>
				</div>
			</form>
		</div>
	);
}
