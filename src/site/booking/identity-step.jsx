"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/utils/auth/auth-client";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Checkbox } from "@/shadcn/components/ui/checkbox";

export const EMPTY_IDENTITY = {
	// Sub-flow state. `init` means we haven't checked the session yet.
	// `admin_form` is the admin-mode single-step form.
	phase: "init", // init | ask_email | magic_link_sent | pick_org | new_org | new_user | admin_form
	email: "",
	sessionUser: null,
	myOrgs: [],
	selectedOrgId: null,
	// New-org fields (also reused for existing user with no orgs yet)
	newOrgName: "",
	newOrgDescription: "",
	// New-user fields (no account exists yet)
	firstName: "",
	lastName: "",
	phone: "",
	marketingOptIn: false,
	// Admin-mode only: when true the admin is creating a new org inline.
	adminCreatingOrg: false,
};

/**
 * Returns true when the identity step has gathered enough to let the wizard
 * move on. Used by the wizard's canAdvance gate.
 */
export function identityComplete(v) {
	if (!v) return false;
	if (v.phase === "pick_org") {
		return Boolean(v.selectedOrgId);
	}
	if (v.phase === "new_org") {
		return Boolean(v.newOrgName.trim() && v.newOrgDescription.trim());
	}
	if (v.phase === "new_user") {
		return Boolean(
			v.firstName.trim() &&
				v.lastName.trim() &&
				v.email.trim() &&
				v.newOrgName.trim() &&
				v.newOrgDescription.trim(),
		);
	}
	if (v.phase === "admin_form") {
		const baseValid =
			v.firstName.trim() && v.lastName.trim() && v.email.trim().includes("@");
		if (!baseValid) return false;
		if (v.adminCreatingOrg) {
			return Boolean(v.newOrgName.trim() && v.newOrgDescription.trim());
		}
		return Boolean(v.selectedOrgId);
	}
	return false;
}

export default function IdentityStep({
	value,
	onChange,
	adminMode = false,
	availableOrganisations = [],
}) {
	const v = value;
	const set = useCallback((patch) => onChange({ ...v, ...patch }), [v, onChange]);

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);
	const [pollingTimedOut, setPollingTimedOut] = useState(false);
	const [pollVersion, setPollVersion] = useState(0);
	const pollingRef = useRef(null);

	// On mount: admin-mode goes straight to the admin form. Public mode
	// checks for an existing session and either confirms or asks for email.
	useEffect(() => {
		if (v.phase !== "init") return;
		if (adminMode) {
			set({ phase: "admin_form" });
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const { data } = await authClient.getSession();
				if (cancelled) return;
				if (data?.user) {
					await confirmSession(data.user);
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

	const [manualChecking, setManualChecking] = useState(false);

	// One-shot session check. Returns the user if signed in, else null. Used
	// by the interval, the manual "I've signed in" button, and the
	// visibilitychange handler so mobile users returning to the tab don't
	// have to wait up to 3s for the next poll tick.
	const checkSessionNow = useCallback(async () => {
		try {
			const { data } = await authClient.getSession();
			if (data?.user) {
				if (pollingRef.current) {
					clearInterval(pollingRef.current);
					pollingRef.current = null;
				}
				await confirmSession(data.user);
				return data.user;
			}
		} catch {}
		return null;
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Polling for session after a magic link is sent. Capped at ~3 minutes
	// (60 polls × 3s) so an abandoned tab doesn't poll forever. Once the cap
	// hits the UI shows a "didn't get the link?" panel that lets the user
	// resend or switch email.
	useEffect(() => {
		if (v.phase !== "magic_link_sent") return;
		setPollingTimedOut(false);
		let attempts = 0;
		const MAX_ATTEMPTS = 60;
		const id = setInterval(async () => {
			attempts += 1;
			const user = await checkSessionNow();
			if (user) return; // checkSessionNow clears the interval itself
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

	// Mobile: clicking the magic link usually opens a new tab. When the
	// user comes back to this tab, fire an immediate check instead of
	// waiting for the next poll tick (or worse, waiting at all if the
	// interval was throttled by the browser while the tab was hidden).
	useEffect(() => {
		if (v.phase !== "magic_link_sent") return;
		function onVisible() {
			if (document.visibilityState === "visible") {
				checkSessionNow().then((user) => {
					if (!user && pollingTimedOut) {
						setPollingTimedOut(false);
						setPollVersion((n) => n + 1);
					}
				});
			}
		}
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("focus", onVisible);
		return () => {
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("focus", onVisible);
		};
	}, [v.phase, pollingTimedOut, checkSessionNow]);

	async function manualCheck() {
		setManualChecking(true);
		try {
			const user = await checkSessionNow();
			if (!user) {
				// Restart polling for another window in case the user is mid-click
				setPollingTimedOut(false);
				setPollVersion((n) => n + 1);
			}
		} finally {
			setManualChecking(false);
		}
	}

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

	async function confirmSession(sessionUser) {
		let orgs = [];
		try {
			const res = await fetch("/api/booking/identity/my-orgs");
			if (res.ok) {
				const data = await res.json();
				orgs = data.orgs || [];
			}
		} catch {}
		if (orgs.length === 0) {
			set({
				phase: "new_org",
				sessionUser,
				email: sessionUser.email,
				myOrgs: [],
				selectedOrgId: null,
			});
		} else if (orgs.length === 1) {
			set({
				phase: "pick_org",
				sessionUser,
				email: sessionUser.email,
				myOrgs: orgs,
				selectedOrgId: orgs[0].id,
			});
		} else {
			set({
				phase: "pick_org",
				sessionUser,
				email: sessionUser.email,
				myOrgs: orgs,
				selectedOrgId: null,
			});
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
				set({ phase: "new_user" });
			}
		} catch (e) {
			setError(e?.message || "Something went wrong.");
		} finally {
			setBusy(false);
		}
	}

	// -------- Renders ---------------------------------------------------

	if (v.phase === "init") {
		return (
			<div className="text-sm text-muted-foreground py-6 text-center">
				Just a moment…
			</div>
		);
	}

	if (v.phase === "ask_email") {
		return (
			<form onSubmit={checkEmail} className="space-y-4">
				<div className="space-y-1">
					<h3 className="font-display text-xl tracking-tight">Who are we booking for?</h3>
					<p className="text-sm text-muted-foreground">
						Pop your email in. If you&apos;ve booked before we&apos;ll email you
						a sign-in link; if you&apos;re new we&apos;ll take a few details.
					</p>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="id-email">Email</Label>
					<Input
						id="id-email"
						type="email"
						autoComplete="email"
						required
						placeholder="you@example.com"
						value={v.email}
						onChange={(e) => set({ email: e.target.value })}
						disabled={busy}
					/>
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
			<div className="space-y-4 text-center max-w-md mx-auto">
				<h3 className="font-display text-xl tracking-tight">Check your email.</h3>
				<p className="text-sm text-muted-foreground">
					We&apos;ve sent a sign-in link to{" "}
					<span className="font-medium text-foreground">{v.email}</span>.
				</p>
				<p className="text-sm text-muted-foreground">
					Open it from your email — your booking will pick up here automatically.
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
						<Button
							type="button"
							variant="outline"
							onClick={manualCheck}
							disabled={manualChecking || busy}
						>
							{manualChecking ? "Checking…" : "I've clicked the link — check now"}
						</Button>
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

	if (v.phase === "pick_org") {
		return (
			<div className="space-y-4">
				<div className="space-y-1">
					<h3 className="font-display text-xl tracking-tight">Which organisation?</h3>
					<p className="text-sm text-muted-foreground">
						Signed in as <span className="font-medium text-foreground">{v.email}</span>.
						Choose which organisation this booking is for.
					</p>
				</div>
				<div className="space-y-2">
					{v.myOrgs.map((o) => (
						<label
							key={o.id}
							className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition ${
								v.selectedOrgId === o.id
									? "border-primary bg-primary/5"
									: "border-foreground/10 hover:border-foreground/30"
							}`}
						>
							<input
								type="radio"
								name="org"
								className="accent-primary"
								checked={v.selectedOrgId === o.id}
								onChange={() => set({ selectedOrgId: o.id })}
							/>
							<span className="text-sm">{o.name}</span>
						</label>
					))}
					<button
						type="button"
						className="text-xs underline text-muted-foreground hover:text-foreground"
						onClick={() =>
							set({
								phase: "new_org",
								selectedOrgId: null,
								newOrgName: "",
								newOrgDescription: "",
							})
						}
					>
						+ Add a new organisation
					</button>
				</div>
			</div>
		);
	}

	if (v.phase === "new_org") {
		return (
			<div className="space-y-4">
				<div className="space-y-1">
					<h3 className="font-display text-xl tracking-tight">Tell us about your organisation</h3>
					<p className="text-sm text-muted-foreground">
						Signed in as <span className="font-medium text-foreground">{v.email}</span>.
					</p>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="org-name">Organisation name</Label>
					<Input
						id="org-name"
						required
						value={v.newOrgName}
						onChange={(e) => set({ newOrgName: e.target.value })}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="org-desc">In a few words, tell us about your organisation</Label>
					<Textarea
						id="org-desc"
						rows={3}
						required
						placeholder="e.g. a local choir who rehearse weekly and put on two concerts a year."
						value={v.newOrgDescription}
						onChange={(e) => set({ newOrgDescription: e.target.value })}
					/>
				</div>
				{v.myOrgs.length > 0 && (
					<button
						type="button"
						className="text-xs underline text-muted-foreground hover:text-foreground"
						onClick={() =>
							set({
								phase: "pick_org",
								newOrgName: "",
								newOrgDescription: "",
							})
						}
					>
						← Use one of my existing organisations
					</button>
				)}
			</div>
		);
	}

	if (v.phase === "new_user") {
		return (
			<div className="space-y-4">
				<div className="space-y-1">
					<h3 className="font-display text-xl tracking-tight">Welcome — let&apos;s get you set up</h3>
					<p className="text-sm text-muted-foreground">
						We don&apos;t have <span className="font-medium text-foreground">{v.email}</span> on
						file. Tell us a little about you and your organisation.
					</p>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1.5">
						<Label htmlFor="fn">First name</Label>
						<Input
							id="fn"
							required
							autoComplete="given-name"
							value={v.firstName}
							onChange={(e) => set({ firstName: e.target.value })}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="ln">Last name</Label>
						<Input
							id="ln"
							required
							autoComplete="family-name"
							value={v.lastName}
							onChange={(e) => set({ lastName: e.target.value })}
						/>
					</div>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="phone">Phone (optional)</Label>
					<Input
						id="phone"
						type="tel"
						autoComplete="tel"
						value={v.phone}
						onChange={(e) => set({ phone: e.target.value })}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="nu-org-name">Organisation name</Label>
					<Input
						id="nu-org-name"
						required
						value={v.newOrgName}
						onChange={(e) => set({ newOrgName: e.target.value })}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="nu-org-desc">In a few words, tell us about your organisation</Label>
					<Textarea
						id="nu-org-desc"
						rows={3}
						required
						placeholder="e.g. a local choir who rehearse weekly and put on two concerts a year."
						value={v.newOrgDescription}
						onChange={(e) => set({ newOrgDescription: e.target.value })}
					/>
				</div>
				<label className="flex items-start gap-2 text-sm pt-1">
					<Checkbox
						checked={v.marketingOptIn}
						onCheckedChange={(c) => set({ marketingOptIn: c === true })}
					/>
					<span className="text-muted-foreground">
						Send me occasional updates from The Assembly Rooms.
					</span>
				</label>
				<button
					type="button"
					className="text-xs underline text-muted-foreground hover:text-foreground"
					onClick={() => set({ phase: "ask_email" })}
				>
					← Use a different email
				</button>
			</div>
		);
	}

	if (v.phase === "admin_form") {
		return (
			<div className="space-y-4">
				<div className="space-y-1">
					<h3 className="font-display text-xl tracking-tight">Customer & organisation</h3>
					<p className="text-sm text-muted-foreground">
						Who's this booking for? If they don&apos;t exist yet we&apos;ll create the
						records on submit.
					</p>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1.5">
						<Label htmlFor="af-first">First name</Label>
						<Input
							id="af-first"
							required
							value={v.firstName}
							onChange={(e) => set({ firstName: e.target.value })}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="af-last">Last name</Label>
						<Input
							id="af-last"
							required
							value={v.lastName}
							onChange={(e) => set({ lastName: e.target.value })}
						/>
					</div>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="af-email">Email</Label>
					<Input
						id="af-email"
						type="email"
						required
						value={v.email}
						onChange={(e) => set({ email: e.target.value })}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="af-phone">Phone (optional)</Label>
					<Input
						id="af-phone"
						type="tel"
						value={v.phone}
						onChange={(e) => set({ phone: e.target.value })}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="af-org">Organisation</Label>
					{v.adminCreatingOrg ? (
						<div className="space-y-2 rounded-md border border-foreground/10 p-3">
							<div className="space-y-1.5">
								<Label htmlFor="af-org-name">New organisation name</Label>
								<Input
									id="af-org-name"
									required
									value={v.newOrgName}
									onChange={(e) => set({ newOrgName: e.target.value })}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="af-org-desc">Short description</Label>
								<Textarea
									id="af-org-desc"
									rows={2}
									required
									value={v.newOrgDescription}
									onChange={(e) => set({ newOrgDescription: e.target.value })}
								/>
							</div>
							<button
								type="button"
								className="text-xs underline text-muted-foreground hover:text-foreground"
								onClick={() =>
									set({
										adminCreatingOrg: false,
										newOrgName: "",
										newOrgDescription: "",
									})
								}
							>
								← Pick an existing organisation instead
							</button>
						</div>
					) : (
						<select
							id="af-org"
							className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
							value={v.selectedOrgId ?? ""}
							onChange={(e) => {
								const next = e.target.value;
								if (next === "__create__") {
									set({
										adminCreatingOrg: true,
										selectedOrgId: null,
									});
								} else {
									set({ selectedOrgId: next || null });
								}
							}}
						>
							<option value="">Select an organisation…</option>
							{availableOrganisations.map((o) => (
								<option key={o.id} value={o.id}>
									{o.name}
								</option>
							))}
							<option value="__create__">+ Create new organisation…</option>
						</select>
					)}
				</div>
			</div>
		);
	}

	return null;
}
