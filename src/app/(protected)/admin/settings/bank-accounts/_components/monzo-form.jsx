"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
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
	saveMonzoCredentialsAction,
	authoriseMonzoAccountAction,
	pickMonzoAccountAction,
	probeMonzoAction,
} from "../actions";

const ACCOUNT_PICKER_NONE = "__none__";

/**
 * Monzo setup is a 3-step flow, same shape as Revolut:
 *   1. Save the OAuth client (client_id, client_secret, redirect_uri).
 *   2. Visit Monzo's auth URL, approve in the Monzo app, then paste
 *      the `code` from the redirect URL back here.
 *   3. Pick which Monzo account to link.
 *
 * Important quirk: after step 2, Monzo pushes a second "Strong Customer
 * Authentication" approval to the user's phone. Until they tap Approve
 * there, /transactions returns `forbidden.verification_required`. The
 * probe surfaces a clear error for that case.
 */
export default function MonzoForm({ open, onOpenChange, initial }) {
	const router = useRouter();
	const isEditing = !!initial;
	const existingCreds = initial?.credentials ?? {};
	const hasTokens = Boolean(existingCreds.access_token);

	const [label, setLabel] = useState(initial?.label ?? "");
	const [clientId, setClientId] = useState(existingCreds.client_id ?? "");
	const [redirectUri, setRedirectUri] = useState(existingCreds.redirect_uri ?? "");
	const [clientSecret, setClientSecret] = useState("");
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [savedId, setSavedId] = useState(initial?.id ?? null);
	const [discovered, setDiscovered] = useState([]);
	const [chosenAccount, setChosenAccount] = useState(initial?.external_account_uid ?? "");
	const [needsSca, setNeedsSca] = useState(false);

	const authoriseUrl = useMemo(() => {
		if (!clientId || !redirectUri || !savedId) return null;
		// We embed the bank_account id in `state` so the redirect URI can
		// pick the flow back up server-side without the user copy-pasting
		// the code. Prefix marks it as ours so we can ignore stray state
		// values that aren't account ids.
		const params = new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: "code",
			state: `nexus:${savedId}`,
		});
		return `https://auth.monzo.com/?${params}`;
	}, [clientId, redirectUri, savedId]);

	async function saveCreds() {
		setBusy(true);
		try {
			const res = await saveMonzoCredentialsAction({
				id: savedId,
				label: label.trim(),
				client_id: clientId.trim(),
				client_secret: clientSecret || null,
				redirect_uri: redirectUri.trim(),
			});
			setSavedId(res.id);
			setClientSecret("");
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
			const res = await authoriseMonzoAccountAction({ id: savedId, code: code.trim() });
			setDiscovered(res.accounts ?? []);
			setNeedsSca(!!res.needs_sca);
			if (res.accounts?.length === 1 && !chosenAccount) {
				setChosenAccount(res.accounts[0].id);
			}
			setCode("");
			if (res.needs_sca) {
				toast.message(
					"Authorised - now approve in the Monzo app",
					{ description: "Monzo will push a Strong Customer Authentication card. Tap Approve, then click Test connection." },
				);
			} else if (res.accounts?.length === 0) {
				toast.message("Authorised", {
					description: "Couldn't list accounts yet. Approve in the Monzo app, then click Test connection.",
				});
			} else {
				toast.success("Authorised. Pick the account to link.");
			}
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
			await pickMonzoAccountAction({
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
			const res = await probeMonzoAction({ id: savedId });
			if (res.ok) {
				setNeedsSca(false);
				toast.success(`Connected - ${res.account_label ?? res.account_count + " account(s)"}.`);
			} else {
				if (/verification_required/i.test(res.error || "")) {
					setNeedsSca(true);
				}
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
					<DialogTitle>{isEditing ? "Edit Monzo account" : "Add Monzo account"}</DialogTitle>
					<DialogDescription>
						Three steps: save your OAuth client, visit Monzo to authorise, then
						pick the account to link. You&apos;ll need to approve a Strong
						Customer Authentication card in your Monzo app after step 2.
					</DialogDescription>
				</DialogHeader>

				{/* Step 1 - credentials */}
				<section className="space-y-4">
					<div className="flex items-baseline justify-between">
						<h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
							1 · OAuth client
						</h3>
						{savedId && (
							<span className="text-[10px] uppercase tracking-[0.18em] text-primary">Saved</span>
						)}
					</div>
					<p className="text-[11px] text-muted-foreground">
						Create a confidential client at{" "}
						<a
							href="https://developers.monzo.com/apps"
							target="_blank"
							rel="noopener noreferrer"
							className="underline underline-offset-2"
						>
							developers.monzo.com/apps
						</a>{" "}
						with the redirect URI below.
					</p>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="mz-label">Label</Label>
							<Input
								id="mz-label"
								placeholder="e.g. Monzo Business"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="mz-client-id">Client ID</Label>
							<Input
								id="mz-client-id"
								placeholder="oauth2client_…"
								value={clientId}
								onChange={(e) => setClientId(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="mz-secret">
								Client secret{" "}
								{hasTokens && (
									<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
										Optional · already saved
									</span>
								)}
							</Label>
							<Input
								id="mz-secret"
								type="password"
								placeholder={hasTokens ? "Leave blank to keep existing secret" : "mnzpub.…"}
								value={clientSecret}
								onChange={(e) => setClientSecret(e.target.value)}
								autoComplete="off"
							/>
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="mz-redirect">Redirect URI</Label>
							<Input
								id="mz-redirect"
								placeholder="https://www.assembly-rooms.com/admin/settings/bank-accounts"
								value={redirectUri}
								onChange={(e) => setRedirectUri(e.target.value)}
							/>
							<p className="text-[11px] text-muted-foreground">
								Must match the URI on the Monzo developer app exactly.
							</p>
						</div>
					</div>
					<div className="flex justify-end">
						<Button
							onClick={saveCreds}
							disabled={busy || !label || !clientId || !redirectUri}
						>
							{busy ? "Saving…" : savedId ? "Update credentials" : "Save credentials"}
						</Button>
					</div>
				</section>

				{/* Step 2 - authorise */}
				{savedId && (
					<section className="space-y-3 pt-4 border-t border-foreground/10">
						<h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
							2 · Authorise on Monzo
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
								, approve in the Monzo email + app, and paste the{" "}
								<span className="font-mono">code</span> from the redirect URL
								below.
							</p>
						) : (
							<p className="text-sm text-muted-foreground">
								Save credentials first to enable this step.
							</p>
						)}
						<div className="space-y-1.5">
							<Label htmlFor="mz-code">Authorisation code</Label>
							<Input
								id="mz-code"
								placeholder="authcode_…"
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

				{/* SCA prompt */}
				{savedId && hasTokens && needsSca && (
					<div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-2">
						<div className="font-medium text-amber-700 dark:text-amber-300">
							Approve in the Monzo app
						</div>
						<p className="text-muted-foreground text-xs">
							Monzo has pushed a Strong Customer Authentication card to your
							phone. Open the Monzo app, tap into it, and choose &ldquo;Approve
							all account data&rdquo;. Then click Test connection.
						</p>
					</div>
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
											{describeMonzoAccount(a)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<p className="text-sm text-muted-foreground">
								Once you&apos;ve approved in the Monzo app, click Test
								connection below to pull the account list.
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

function describeMonzoAccount(a) {
	const type = a.type === "uk_retail_joint"
		? "Joint current"
		: a.type === "uk_retail"
			? "Personal current"
			: a.type === "uk_business"
				? "Business"
				: a.type === "uk_monzo_flex"
					? "Flex"
					: a.type || "Account";
	const ident = a.account_number ? ` · ${a.sort_code} ${a.account_number.slice(-4)}` : "";
	return `${type} · ${a.currency || "GBP"}${ident}`;
}

