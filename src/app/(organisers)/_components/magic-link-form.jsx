"use client";

import { useState } from "react";
import { authClient } from "@/utils/auth/auth-client";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";

export default function MagicLinkForm({
	callbackURL = "/my-bookings",
	heading = "Sign in to your portal",
	body = "Pop your email in. We'll send a one-click sign-in link - no password needed.",
}) {
	const [email, setEmail] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState(null);

	async function submit(e) {
		e.preventDefault();
		if (!email.trim()) return;
		setSubmitting(true);
		setError(null);
		try {
			const { error: err } = await authClient.signIn.magicLink({
				email: email.trim(),
				callbackURL,
			});
			if (err) {
				setError(err.message || "Couldn't send the link.");
				return;
			}
			setSent(true);
		} catch (e) {
			setError(e?.message || "Couldn't send the link.");
		} finally {
			setSubmitting(false);
		}
	}

	if (sent) {
		return (
			<div className="rounded-xl border border-primary/30 bg-primary/5 p-8 text-center space-y-3 max-w-md mx-auto">
				<h2 className="font-display text-2xl tracking-tight">Check your email.</h2>
				<p className="text-sm text-muted-foreground">
					We&apos;ve sent a sign-in link to <span className="font-medium text-foreground">{email}</span>.
					Click it on this device - the link works for 15 minutes.
				</p>
				<button
					type="button"
					className="text-xs text-muted-foreground hover:text-foreground underline"
					onClick={() => {
						setSent(false);
						setEmail("");
					}}
				>
					Use a different email
				</button>
			</div>
		);
	}

	return (
		<form
			onSubmit={submit}
			className="rounded-xl border border-foreground/10 bg-card p-8 space-y-5 max-w-md mx-auto"
		>
			<div className="space-y-2 text-center">
				<h2 className="font-display text-2xl tracking-tight">{heading}</h2>
				<p className="text-sm text-muted-foreground">{body}</p>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="ml-email">Email</Label>
				<Input
					id="ml-email"
					type="email"
					autoComplete="email"
					required
					placeholder="you@example.com"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					disabled={submitting}
				/>
			</div>
			{error && (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}
			<Button type="submit" className="w-full" disabled={submitting || !email.trim()}>
				{submitting ? "Sending…" : "Email me a sign-in link"}
			</Button>
		</form>
	);
}
