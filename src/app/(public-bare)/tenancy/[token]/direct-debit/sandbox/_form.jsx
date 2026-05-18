"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { submitSandboxAction, cancelSandboxAction } from "./actions";

function formatSortCode(raw) {
	const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 6);
	if (digits.length <= 2) return digits;
	if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
	return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

export default function SandboxForm({ sessionId, cancelHref, accountName: initialName }) {
	const router = useRouter();
	const [name, setName] = useState(initialName ?? "");
	const [sortCode, setSortCode] = useState("");
	const [accountNumber, setAccountNumber] = useState("");
	const [error, setError] = useState(null);
	const [pending, startTransition] = useTransition();
	const [cancelling, setCancelling] = useState(false);

	function submit(e) {
		e.preventDefault();
		setError(null);
		startTransition(async () => {
			try {
				const res = await submitSandboxAction({
					session_id: sessionId,
					account_name: name,
					sort_code: sortCode,
					account_number: accountNumber,
				});
				if (res?.next_url) router.push(res.next_url);
			} catch (err) {
				setError(err?.message || "Could not submit details. Try again.");
			}
		});
	}

	async function cancel() {
		setCancelling(true);
		try {
			const res = await cancelSandboxAction(sessionId);
			router.push(res?.next_url || cancelHref);
		} catch (err) {
			setError(err?.message || "Could not cancel.");
			setCancelling(false);
		}
	}

	const submitDisabled =
		pending ||
		name.trim().length < 2 ||
		sortCode.replace(/\D/g, "").length !== 6 ||
		accountNumber.replace(/\D/g, "").length !== 8;

	return (
		<form onSubmit={submit} className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="account_name">Account holder name</Label>
				<Input
					id="account_name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Jane Smith"
					disabled={pending}
					autoComplete="off"
				/>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div className="space-y-2">
					<Label htmlFor="sort_code">Sort code</Label>
					<Input
						id="sort_code"
						value={sortCode}
						onChange={(e) => setSortCode(formatSortCode(e.target.value))}
						placeholder="12-34-56"
						inputMode="numeric"
						disabled={pending}
						autoComplete="off"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="account_number">Account number</Label>
					<Input
						id="account_number"
						value={accountNumber}
						onChange={(e) =>
							setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 8))
						}
						placeholder="12345678"
						inputMode="numeric"
						disabled={pending}
						autoComplete="off"
					/>
				</div>
			</div>

			{error && (
				<div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}

			<div className="flex items-center gap-2 pt-2">
				<Button type="submit" disabled={submitDisabled}>
					{pending ? "Confirming…" : "Set up direct debit"}
				</Button>
				<Button
					type="button"
					variant="ghost"
					onClick={cancel}
					disabled={pending || cancelling}
				>
					{cancelling ? "Cancelling…" : "Cancel"}
				</Button>
			</div>
		</form>
	);
}
