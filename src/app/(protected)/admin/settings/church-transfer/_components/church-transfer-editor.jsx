"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { saveChurchTransferSettingsAction } from "../actions";

export default function ChurchTransferEditor({ initial }) {
	const router = useRouter();
	const [counterpartyName, setCounterpartyName] = useState(initial?.counterparty_name ?? "");
	const [sortCode, setSortCode] = useState(initial?.sort_code ?? "");
	const [accountNumber, setAccountNumber] = useState(initial?.account_number ?? "");
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState(null);
	const [error, setError] = useState(null);

	async function save() {
		setSaving(true);
		setError(null);
		try {
			await saveChurchTransferSettingsAction({
				counterparty_name: counterpartyName,
				sort_code: sortCode,
				account_number: accountNumber,
			});
			setSavedAt(new Date());
			router.refresh();
		} catch (err) {
			setError(err?.message || "Save failed");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-6">
			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
					{error}
				</div>
			)}
			<div className="rounded-lg border bg-card p-6 space-y-5">
				<div className="space-y-2">
					<Label htmlFor="counterparty_name">Counterparty name</Label>
					<Input
						id="counterparty_name"
						type="text"
						placeholder="Assembly Church"
						value={counterpartyName}
						onChange={(e) => setCounterpartyName(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">
						Case-insensitive partial match against the counterparty name on
						outbound transactions.
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="sort_code">Sort code</Label>
						<Input
							id="sort_code"
							type="text"
							placeholder="04-00-04"
							value={sortCode}
							onChange={(e) => setSortCode(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Hyphens and spaces are stripped before matching.
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="account_number">Account number (last 4 ok)</Label>
						<Input
							id="account_number"
							type="text"
							placeholder="12345678"
							value={accountNumber}
							onChange={(e) => setAccountNumber(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Partial match - any substring is enough.
						</p>
					</div>
				</div>
				<div className="flex items-center justify-end gap-3">
					{savedAt && <span className="text-xs text-muted-foreground">Saved.</span>}
					<Button onClick={save} disabled={saving}>
						{saving ? "Saving..." : "Save"}
					</Button>
				</div>
			</div>
			<div className="rounded-md border border-dashed bg-muted/30 p-4 text-xs text-muted-foreground">
				Existing transactions aren't automatically re-evaluated when these
				settings change. The next sync will pick up new matches; for older
				transactions, use the "Mark as church transfer" toggle on individual
				rows in the Banking page.
			</div>
		</div>
	);
}
