"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Label } from "@/shadcn/components/ui/label";
import { savePaymentsSettingsAction } from "../actions";

const OPTIONS = [
	{
		key: "fake",
		title: "FakePSP",
		blurb:
			"Default. Collects mock card details (any card number ending 0000 simulates a decline), no real money moves. Used in dev and for demos.",
	},
	{
		key: "stripe",
		title: "Stripe",
		blurb:
			"Production payment provider. The driver is plumbed but currently stubbed — pick this once the Stripe go-live phase ships and your account + keys are configured.",
		disabled: true,
		comingSoon: true,
	},
];

export default function PaymentsEditor({ initial }) {
	const router = useRouter();
	const [provider, setProvider] = useState(initial?.provider ?? "fake");
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState(null);
	const [error, setError] = useState(null);

	async function save() {
		setSaving(true);
		setError(null);
		try {
			await savePaymentsSettingsAction({ provider });
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
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}
			<div className="space-y-3">
				<Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
					Active payment provider
				</Label>
				<div className="grid gap-3">
					{OPTIONS.map((opt) => {
						const selected = provider === opt.key;
						return (
							<button
								key={opt.key}
								type="button"
								onClick={() => !opt.disabled && setProvider(opt.key)}
								disabled={opt.disabled}
								className={`text-left rounded-lg border px-4 py-4 transition flex items-start justify-between gap-4 ${
									selected
										? "border-primary bg-primary/5"
										: "border-foreground/10 hover:border-foreground/30 bg-background"
								} ${opt.disabled ? "opacity-60 cursor-not-allowed" : ""}`}
							>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<span className="font-medium">{opt.title}</span>
										{opt.comingSoon && (
											<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground border border-foreground/15 rounded-full px-1.5 py-0.5">
												coming soon
											</span>
										)}
									</div>
									<p className="text-sm text-muted-foreground mt-1">{opt.blurb}</p>
								</div>
							</button>
						);
					})}
				</div>
			</div>
			<div className="flex items-center justify-end gap-3">
				{savedAt && <span className="text-xs text-muted-foreground">Saved.</span>}
				<Button onClick={save} disabled={saving}>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</div>
	);
}
