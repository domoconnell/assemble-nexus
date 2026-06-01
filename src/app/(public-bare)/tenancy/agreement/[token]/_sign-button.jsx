"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { signTenancyAgreementAction } from "./actions";

const todayFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric", month: "long", year: "numeric",
});

export default function SignButton({ token, chainTo }) {
	const router = useRouter();
	const [name, setName] = useState("");
	const [agreed, setAgreed] = useState(false);
	const [error, setError] = useState(null);
	const [pending, startTransition] = useTransition();

	const trimmed = name.trim();
	const canSubmit = !!trimmed && agreed && !pending;

	function submit() {
		setError(null);
		if (!trimmed) {
			setError("Type your full name to sign.");
			return;
		}
		if (!agreed) {
			setError("Confirm you accept the agreement first.");
			return;
		}
		startTransition(async () => {
			try {
				const res = await signTenancyAgreementAction({
					token,
					signed_by_name: trimmed,
				});
				toast.success(
					res?.next_url
						? "Signed. Taking you to direct debit setup…"
						: "Agreement signed.",
				);
				if (res?.next_url) {
					router.push(res.next_url);
				} else {
					router.refresh();
				}
			} catch (err) {
				setError(err?.message || "Could not record signature. Try again.");
			}
		});
	}

	return (
		<div className="rounded-lg border bg-card p-6 space-y-5">
			<div>
				<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Sign agreement
				</div>
				<p className="text-sm text-muted-foreground mt-2">
					Typing your full name below counts as your digital signature.
					{chainTo && (
						<> You&apos;ll be taken to set up direct debit straight after.</>
					)}
				</p>
			</div>

			{/* Signature preview - mimics a paper signature line. */}
			<div className="rounded-md border-2 border-dashed border-foreground/20 bg-background/60 px-5 py-6 flex items-end justify-between gap-4 min-h-30">
				<div className="flex-1 min-w-0">
					<div
						className="text-4xl sm:text-5xl text-foreground/90 leading-tight italic wrap-break-word"
						style={{ fontFamily: "var(--font-caveat), 'Brush Script MT', cursive" }}
					>
						{trimmed || (
							<span className="text-muted-foreground/40 not-italic font-sans text-base">
								Your signature will appear here
							</span>
						)}
					</div>
					<div className="mt-3 border-t border-foreground/20 pt-2 flex items-baseline justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						<span>Signed by</span>
						<span>{todayFmt.format(new Date())}</span>
					</div>
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor="signed_by_name">Full name</Label>
				<Input
					id="signed_by_name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Jane Smith"
					disabled={pending}
					autoComplete="off"
				/>
			</div>

			<label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer select-none">
				<input
					type="checkbox"
					checked={agreed}
					onChange={(e) => setAgreed(e.target.checked)}
					disabled={pending}
					className="mt-1"
				/>
				<span>
					I have read the agreement above and I&apos;m authorised to sign it on
					behalf of my organisation.
				</span>
			</label>

			{error && (
				<div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}

			<Button onClick={submit} disabled={!canSubmit}>
				{pending ? "Signing…" : "Sign agreement"}
			</Button>
		</div>
	);
}
