"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/utils/auth/auth-client";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";

export const EMPTY_BUYER_IDENTITY = {
	// Sub-flow state. `init` means we haven't checked the session yet.
	phase: "init", // init | session | ask_email | magic_link_sent | new_user_form
	email: "",
	sessionUser: null, // { id, email, first_name, last_name } when phase === "session"
	firstName: "",
	lastName: "",
	phone: "",
};

/**
 * The buyer is "ready" when:
 * - phase === "session" (logged-in user is the buyer), OR
 * - phase === "new_user_form" with all required fields filled
 */
export function buyerIdentityComplete(v) {
	if (!v) return false;
	if (v.phase === "session") return Boolean(v.sessionUser?.id);
	if (v.phase === "new_user_form") {
		return Boolean(
			v.firstName.trim() &&
				v.lastName.trim() &&
				v.email.trim().includes("@"),
		);
	}
	return false;
}

/**
 * Payload shape for `/api/ticket-orders`. Either:
 *   { mode: "session" }
 *   { mode: "new_user", new_user: { first_name, last_name, email, phone? } }
 */
export function buildBuyerIdentityPayload(v) {
	if (v.phase === "session") return { mode: "session" };
	if (v.phase === "new_user_form") {
		return {
			mode: "new_user",
			new_user: {
				first_name: v.firstName.trim(),
				last_name: v.lastName.trim(),
				email: v.email.trim(),
				phone: v.phone.trim() || null,
			},
		};
	}
	return null;
}

export default function BuyerIdentity({ value, onChange }) {
	const v = value;
	const set = useCallback((patch) => onChange({ ...v, ...patch }), [v, onChange]);

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);
	const [pollingTimedOut, setPollingTimedOut] = useState(false);
	const [pollVersion, setPollVersion] = useState(0);
	const pollingRef = useRef(null);

	// On mount: check existing session.
	useEffect(() => {
		if (v.phase !== "init") return;
		let cancelled = false;
		(async () => {
			try {
				const { data } = await authClient.getSession();
				if (cancelled) return;
				if (data?.user) {
					set({ phase: "session", sessionUser: data.user, email: data.user.email });
				} else {
					set({ phase: "ask_email" });
				}
			} catch {
				if (!cancelled) set({ phase: "ask_email" });
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Polling for session after a magic link is sent. Capped at ~3 minutes
	// (60 polls × 3s) so we don't run forever on a tab someone left open. When
	// the cap hits we flip `pollingTimedOut`; the UI shows a "didn't get the
	// link?" prompt that resends or lets them switch email.
	useEffect(() => {
		if (v.phase !== "magic_link_sent") return;
		setPollingTimedOut(false);
		let attempts = 0;
		const MAX_ATTEMPTS = 60;
		const id = setInterval(async () => {
			attempts += 1;
			try {
				const { data } = await authClient.getSession();
				if (data?.user) {
					clearInterval(id);
					pollingRef.current = null;
					set({ phase: "session", sessionUser: data.user, email: data.user.email });
					return;
				}
			} catch {}
			if (attempts >= MAX_ATTEMPTS) {
				clearInterval(id);
				pollingRef.current = null;
				setPollingTimedOut(true);
			}
		}, 3000);
		pollingRef.current = id;
		return () => {
			clearInterval(id);
			pollingRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [v.phase, pollVersion]);

	async function resendMagicLink() {
		setBusy(true);
		setError(null);
		try {
			const { error: err } = await authClient.signIn.magicLink({
				email: v.email.trim(),
				callbackURL: "/auth-verified",
			});
			if (err) throw new Error(err.message || "Couldn't resend the link.");
			setPollingTimedOut(false);
			setPollVersion((n) => n + 1);
		} catch (e) {
			setError(e?.message || "Couldn't resend the link.");
		} finally {
			setBusy(false);
		}
	}

	async function checkEmail(e) {
		e.preventDefault();
		const email = v.email.trim();
		if (!email) return;
		setBusy(true);
		setError(null);
		try {
			const res = await fetch("/api/booking/identity/lookup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data?.error || "Lookup failed");

			if (data.exists) {
				const { error: err } = await authClient.signIn.magicLink({
					email,
					callbackURL: "/auth-verified",
				});
				if (err) throw new Error(err.message || "Couldn't send the sign-in link.");
				set({ phase: "magic_link_sent" });
			} else {
				set({ phase: "new_user_form" });
			}
		} catch (e) {
			setError(e?.message || "Something went wrong.");
		} finally {
			setBusy(false);
		}
	}

	async function switchEmail() {
		setBusy(true);
		setError(null);
		try {
			await authClient.signOut();
		} catch {}
		set({
			phase: "ask_email",
			sessionUser: null,
			email: "",
			firstName: "",
			lastName: "",
			phone: "",
		});
		setBusy(false);
	}

	// -------- Renders ---------------------------------------------------

	if (v.phase === "init") {
		return (
			<div className="text-sm text-muted-foreground py-4 text-center">
				Just a moment…
			</div>
		);
	}

	if (v.phase === "session") {
		const u = v.sessionUser;
		const name = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
		return (
			<div className="space-y-2">
				<div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
					<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
						Buying as
					</div>
					<div className="font-medium mt-0.5">{name || u?.email}</div>
					{name && <div className="text-xs text-muted-foreground">{u?.email}</div>}
				</div>
				<button
					type="button"
					className="text-xs text-muted-foreground hover:text-foreground underline"
					onClick={switchEmail}
					disabled={busy}
				>
					Use a different email →
				</button>
			</div>
		);
	}

	if (v.phase === "ask_email") {
		return (
			<form onSubmit={checkEmail} className="space-y-3">
				<div className="space-y-1.5">
					<Label htmlFor="buyer-email">Email</Label>
					<Input
						id="buyer-email"
						type="email"
						autoComplete="email"
						required
						placeholder="you@example.com"
						value={v.email}
						onChange={(e) => set({ email: e.target.value })}
						disabled={busy}
					/>
					<p className="text-xs text-muted-foreground">
						We&apos;ll send tickets here. If you&apos;ve bought before, we&apos;ll email
						you a sign-in link so they land in the same place.
					</p>
				</div>
				{error && (
					<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
						{error}
					</div>
				)}
				<Button type="submit" disabled={busy || !v.email.trim()}>
					{busy ? "Checking…" : "Continue"}
				</Button>
			</form>
		);
	}

	if (v.phase === "magic_link_sent") {
		return (
			<div className="space-y-3 text-center max-w-md mx-auto">
				<h3 className="font-display text-xl tracking-tight">Check your email.</h3>
				<p className="text-sm text-muted-foreground">
					We&apos;ve sent a sign-in link to{" "}
					<span className="font-medium text-foreground">{v.email}</span>.
				</p>
				<p className="text-sm text-muted-foreground">
					Open it from your email — we&apos;ll pick up here automatically once
					you click it.
					<br />
					<span className="text-xs">
						(Keep this window open. Right-click → open in new tab if you can.)
					</span>
				</p>
				{pollingTimedOut ? (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-2 text-xs">
						<p className="text-amber-700 dark:text-amber-400">
							Still waiting — the link might be in spam, or you opened it in a
							private browser session.
						</p>
						<div className="flex flex-wrap gap-2 justify-center">
							<button
								type="button"
								className="underline text-muted-foreground hover:text-foreground"
								onClick={resendMagicLink}
								disabled={busy}
							>
								{busy ? "Sending…" : "Resend link"}
							</button>
							<span className="text-muted-foreground/60">·</span>
							<button
								type="button"
								className="underline text-muted-foreground hover:text-foreground"
								onClick={() => set({ phase: "ask_email" })}
							>
								Use a different email
							</button>
						</div>
					</div>
				) : (
					<>
						<div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
							<span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" />
							<span>Waiting for you to click the link…</span>
						</div>
						<button
							type="button"
							className="text-xs text-muted-foreground hover:text-foreground underline"
							onClick={() => set({ phase: "ask_email" })}
						>
							Use a different email
						</button>
					</>
				)}
			</div>
		);
	}

	if (v.phase === "new_user_form") {
		return (
			<div className="space-y-3">
				<p className="text-sm text-muted-foreground">
					We don&apos;t have <span className="font-medium text-foreground">{v.email}</span> on
					file. A couple of quick details and we&apos;ll set you up.
				</p>
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1.5">
						<Label htmlFor="buyer-first">First name</Label>
						<Input
							id="buyer-first"
							required
							autoComplete="given-name"
							value={v.firstName}
							onChange={(e) => set({ firstName: e.target.value })}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="buyer-last">Last name</Label>
						<Input
							id="buyer-last"
							required
							autoComplete="family-name"
							value={v.lastName}
							onChange={(e) => set({ lastName: e.target.value })}
						/>
					</div>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="buyer-phone">Phone (optional)</Label>
					<Input
						id="buyer-phone"
						type="tel"
						autoComplete="tel"
						value={v.phone}
						onChange={(e) => set({ phone: e.target.value })}
					/>
				</div>
				<button
					type="button"
					className="text-xs text-muted-foreground hover:text-foreground underline"
					onClick={() => set({ phase: "ask_email" })}
				>
					← Use a different email
				</button>
			</div>
		);
	}

	return null;
}
