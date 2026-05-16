"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Textarea } from "@/shadcn/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shadcn/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/shadcn/components/ui/dialog";
import {
	saveRevolutCredentialsAction,
	authoriseRevolutAccountAction,
	pickRevolutAccountAction,
	probeRevolutAction,
} from "../actions";

const SCOPE = "READ";
const ACCOUNT_PICKER_NONE = "__none__";

/**
 * Revolut Business setup is a 3-step flow:
 *   1. Save credentials (client_id, private_key, redirect_uri, environment)
 *   2. Visit Revolut's authorise URL → paste the auth code back
 *   3. Pick which Revolut account this connection represents
 */
export default function RevolutForm({ open, onOpenChange, initial }) {
	const router = useRouter();
	const isEditing = !!initial;
	const existingCreds = initial?.credentials ?? {};
	const hasTokens = Boolean(existingCreds.access_token);

	const [label, setLabel] = useState(initial?.label ?? "");
	const [environment, setEnvironment] = useState(existingCreds.environment ?? "sandbox");
	const [clientId, setClientId] = useState(existingCreds.client_id ?? "");
	const [issuer, setIssuer] = useState(existingCreds.issuer ?? "");
	const [redirectUri, setRedirectUri] = useState(existingCreds.redirect_uri ?? "");
	const [privateKey, setPrivateKey] = useState("");
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [savedId, setSavedId] = useState(initial?.id ?? null);
	const [discovered, setDiscovered] = useState([]);
	const [chosenAccount, setChosenAccount] = useState(initial?.external_account_uid ?? "");

	const authoriseUrl = useMemo(() => {
		if (!clientId || !redirectUri) return null;
		const base =
			environment === "production"
				? "https://business.revolut.com/app-confirm"
				: "https://sandbox-business.revolut.com/app-confirm";
		const params = new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: "code",
			scope: SCOPE,
		});
		return `${base}?${params}`;
	}, [environment, clientId, redirectUri]);

	async function saveCreds() {
		setBusy(true);
		try {
			const res = await saveRevolutCredentialsAction({
				id: savedId,
				label: label.trim(),
				environment,
				client_id: clientId.trim(),
				issuer: issuer.trim(),
				redirect_uri: redirectUri.trim(),
				private_key_pem: privateKey || null,
			});
			setSavedId(res.id);
			setPrivateKey("");
			toast.success("Credentials saved. Authorise next.");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't save");
		} finally {
			setBusy(false);
		}
	}

	async function authorise() {
		setBusy(true);
		try {
			const res = await authoriseRevolutAccountAction({ id: savedId, code: code.trim() });
			setDiscovered(res.accounts ?? []);
			if (res.accounts?.length === 1 && !chosenAccount) {
				setChosenAccount(res.accounts[0].id);
			}
			toast.success("Authorised. Pick the account to link.");
			setCode("");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Authorisation failed");
		} finally {
			setBusy(false);
		}
	}

	async function pickAccount() {
		setBusy(true);
		try {
			await pickRevolutAccountAction({
				id: savedId,
				external_account_uid: chosenAccount,
			});
			toast.success("Account linked.");
			router.refresh();
			onOpenChange(false);
		} catch (err) {
			toast.error(err?.message || "Couldn't link account");
		} finally {
			setBusy(false);
		}
	}

	async function probe() {
		setBusy(true);
		try {
			const res = await probeRevolutAction({ id: savedId });
			if (res.ok) {
				toast.success(`Connected - ${res.account_label ?? res.account_count + " account(s)"}.`);
			} else {
				toast.error(res.error || "Couldn't connect");
			}
		} catch (err) {
			toast.error(err?.message || "Probe failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="p-6 sm:p-8 space-y-5 max-w-lg">
				<DialogHeader>
					<DialogTitle>{isEditing ? "Edit Revolut account" : "Add Revolut Business account"}</DialogTitle>
					<DialogDescription>
						Three steps: save your client ID + private key, visit Revolut to
						authorise, then pick the account to link.
					</DialogDescription>
				</DialogHeader>

				{/* Step 1 - credentials */}
				<section className="space-y-4">
					<div className="flex items-baseline justify-between">
						<h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
							1 · Credentials
						</h3>
						{savedId && (
							<span className="text-[10px] uppercase tracking-[0.18em] text-primary">Saved</span>
						)}
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="rv-label">Label</Label>
							<Input
								id="rv-label"
								placeholder="e.g. Revolut GBP"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Environment</Label>
							<Select value={environment} onValueChange={setEnvironment}>
								<SelectTrigger><SelectValue /></SelectTrigger>
								<SelectContent>
									<SelectItem value="sandbox">Sandbox</SelectItem>
									<SelectItem value="production">Production</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="rv-client">Client ID</Label>
							<Input
								id="rv-client"
								placeholder="…"
								value={clientId}
								onChange={(e) => setClientId(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="rv-issuer">JWT issuer (your app domain)</Label>
							<Input
								id="rv-issuer"
								placeholder="www.assembly-rooms.com"
								value={issuer}
								onChange={(e) => setIssuer(e.target.value)}
							/>
							<p className="text-[11px] text-muted-foreground">
								The hostname Revolut sees as your app - used in the JWT{" "}
								<span className="font-mono">iss</span> claim.
							</p>
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="rv-redirect">Redirect URI</Label>
							<Input
								id="rv-redirect"
								placeholder="https://www.assembly-rooms.com/admin/settings/bank-accounts"
								value={redirectUri}
								onChange={(e) => setRedirectUri(e.target.value)}
							/>
							<p className="text-[11px] text-muted-foreground">
								Must match the redirect URI registered against the certificate
								in Revolut Business → Settings → APIs.
							</p>
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="rv-key">
								Private key (PEM){" "}
								{hasTokens && (
									<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
										Optional · already saved
									</span>
								)}
							</Label>
							<Textarea
								id="rv-key"
								rows={5}
								className="font-mono text-xs"
								placeholder={hasTokens ? "Leave blank to keep existing key" : "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"}
								value={privateKey}
								onChange={(e) => setPrivateKey(e.target.value)}
								autoComplete="off"
							/>
						</div>
					</div>
					<div className="flex justify-end">
						<Button onClick={saveCreds} disabled={busy || !label || !clientId || !issuer || !redirectUri}>
							{busy ? "Saving…" : savedId ? "Update credentials" : "Save credentials"}
						</Button>
					</div>
				</section>

				{/* Step 2 - authorise */}
				{savedId && (
					<section className="space-y-3 pt-4 border-t border-foreground/10">
						<h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
							2 · Authorise on Revolut
						</h3>
						{authoriseUrl ? (
							<p className="text-sm text-muted-foreground">
								Open{" "}
								<a
									href={authoriseUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="text-foreground underline underline-offset-2 hover:text-primary"
								>
									the authorise URL
								</a>
								, approve access on Revolut, and paste the{" "}
								<span className="font-mono">code</span> from the redirect URL
								below.
							</p>
						) : (
							<p className="text-sm text-muted-foreground">
								Save credentials first to enable this step.
							</p>
						)}
						<div className="space-y-1.5">
							<Label htmlFor="rv-code">Authorisation code</Label>
							<Input
								id="rv-code"
								placeholder="oa_…"
								value={code}
								onChange={(e) => setCode(e.target.value)}
								autoComplete="off"
							/>
						</div>
						<div className="flex justify-end">
							<Button variant="outline" onClick={authorise} disabled={busy || !code}>
								{busy ? "Exchanging…" : "Exchange for tokens"}
							</Button>
						</div>
					</section>
				)}

				{/* Step 3 - pick account */}
				{savedId && (discovered.length > 0 || hasTokens) && (
					<section className="space-y-3 pt-4 border-t border-foreground/10">
						<h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
							3 · Link account
						</h3>
						{discovered.length > 0 ? (
							<Select
								value={chosenAccount || ACCOUNT_PICKER_NONE}
								onValueChange={(v) =>
									setChosenAccount(v === ACCOUNT_PICKER_NONE ? "" : v)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Pick an account" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ACCOUNT_PICKER_NONE}>-</SelectItem>
									{discovered.map((a) => (
										<SelectItem key={a.id} value={a.id}>
											{a.name} · {a.currency} · {a.state}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<p className="text-sm text-muted-foreground">
								Click <Button variant="ghost" size="sm" onClick={probe} disabled={busy}>Test connection</Button>{" "}
								to re-pull the account list.
							</p>
						)}
						<div className="flex justify-between items-center">
							<Button variant="ghost" size="sm" onClick={probe} disabled={busy}>
								{busy ? "Testing…" : "Test connection"}
							</Button>
							{discovered.length > 0 && (
								<Button onClick={pickAccount} disabled={busy || !chosenAccount}>
									{busy ? "Linking…" : "Link account & finish"}
								</Button>
							)}
						</div>
					</section>
				)}
			</DialogContent>
		</Dialog>
	);
}
