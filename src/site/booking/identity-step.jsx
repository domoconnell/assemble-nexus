"use client";

import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/utils/auth/auth-client";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Checkbox } from "@/shadcn/components/ui/checkbox";

export const EMPTY_IDENTITY = {
	// Sub-flow state. `init` means we haven't checked the session yet.
	// `awaiting_otp` is the 6-digit code entry phase. `admin_form` is the
	// admin-mode single-step form.
	phase: "init", // init | ask_email | awaiting_otp | pick_org | new_org | new_user | admin_form
	email: "",
	otp: "",
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

	async function resendOtp() {
		setBusy(true);
		setError(null);
		try {
			const { error: err } = await authClient.emailOtp.sendVerificationOtp({
				email: v.email.trim(),
				type: "sign-in",
			});
			if (err) throw new Error(err.message || "Couldn't send a fresh code.");
			set({ otp: "" });
		} catch (e) {
			setError(e?.message || "Couldn't send a fresh code.");
		} finally {
			setBusy(false);
		}
	}

	async function verifyOtp(e) {
		e?.preventDefault();
		const code = (v.otp ?? "").trim();
		if (code.length < 4) return;
		setBusy(true);
		setError(null);
		try {
			const { data, error: err } = await authClient.signIn.emailOtp({
				email: v.email.trim(),
				otp: code,
			});
			if (err) throw new Error(err.message || "That code didn't match — try again.");
			if (data?.user) {
				await confirmSession(data.user);
			} else {
				throw new Error("Sign-in succeeded but no user was returned.");
			}
		} catch (e) {
			setError(e?.message || "That code didn't match — try again.");
			set({ otp: "" });
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
				const { error: err } = await authClient.emailOtp.sendVerificationOtp({
					email,
					type: "sign-in",
				});
				if (err) throw new Error(err.message || "Couldn't send the sign-in code.");
				set({ phase: "awaiting_otp", otp: "" });
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

	if (v.phase === "awaiting_otp") {
		return (
			<form onSubmit={verifyOtp} className="space-y-4 max-w-md mx-auto text-center">
				<h3 className="font-display text-xl tracking-tight">Check your email.</h3>
				<p className="text-sm text-muted-foreground">
					We&apos;ve sent a 6-digit code to{" "}
					<span className="font-medium text-foreground">{v.email}</span>.
				</p>
				<div className="space-y-1.5 text-left">
					<Label htmlFor="id-otp">Code</Label>
					<Input
						id="id-otp"
						inputMode="numeric"
						autoComplete="one-time-code"
						pattern="[0-9]*"
						maxLength={8}
						required
						placeholder="123456"
						value={v.otp ?? ""}
						onChange={(e) => set({ otp: e.target.value.replace(/\D/g, "") })}
						disabled={busy}
						className="text-center font-mono text-lg tracking-[0.4em]"
					/>
				</div>
				{error && (
					<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive text-left">
						{error}
					</div>
				)}
				<Button type="submit" disabled={busy || (v.otp ?? "").length < 6} className="w-full">
					{busy ? "Verifying…" : "Continue"}
				</Button>
				<div className="flex flex-wrap gap-2 justify-center text-xs">
					<button
						type="button"
						className="underline text-muted-foreground hover:text-foreground"
						onClick={resendOtp}
						disabled={busy}
					>
						{busy ? "Sending…" : "Send a new code"}
					</button>
					<span className="text-muted-foreground/60">·</span>
					<button
						type="button"
						className="underline text-muted-foreground hover:text-foreground"
						onClick={() => set({ phase: "ask_email", otp: "" })}
					>
						Use a different email
					</button>
				</div>
			</form>
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
