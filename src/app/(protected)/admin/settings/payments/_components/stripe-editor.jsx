"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import {
	saveStripeSettingsAction,
	clearStripeSettingsAction,
	testStripeSettingsAction,
} from "../actions";

export default function StripeEditor({ initial }) {
	const router = useRouter();
	const [secretKey, setSecretKey] = useState("");
	const [publishableKey, setPublishableKey] = useState(initial?.publishable_key ?? "");
	const [webhookSecret, setWebhookSecret] = useState(initial?.webhook_signing_secret ?? "");
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState(null);

	const isConfigured = Boolean(initial?.secret_key);

	async function save() {
		setSaving(true);
		setTestResult(null);
		try {
			const result = await saveStripeSettingsAction({
				secret_key: secretKey || null,
				publishable_key: publishableKey || null,
				webhook_signing_secret: webhookSecret || null,
			});
			toast.success(`Stripe settings saved (${result.environment}).`);
			setSecretKey("");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't save");
		} finally {
			setSaving(false);
		}
	}

	async function test() {
		setTesting(true);
		setTestResult(null);
		try {
			const result = await testStripeSettingsAction({ secret_key: secretKey || null });
			setTestResult(result);
			if (result.ok) {
				toast.success(`Connected (${result.env}).`);
			} else {
				toast.error(result.error || "Couldn't connect");
			}
		} catch (err) {
			toast.error(err?.message || "Couldn't test");
		} finally {
			setTesting(false);
		}
	}

	async function clear() {
		if (!confirm("Remove Stripe credentials? Existing orders keep their data; new orders will fall back to FakePSP if Stripe is still the active provider."))
			return;
		setSaving(true);
		try {
			await clearStripeSettingsAction();
			toast.success("Stripe credentials cleared.");
			setSecretKey("");
			setPublishableKey("");
			setWebhookSecret("");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't clear");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="rounded-lg border bg-card overflow-hidden">
			<header className="flex items-center justify-between gap-3 px-6 py-5 bg-linear-to-r from-[#635BFF]/10 via-[#635BFF]/5 to-transparent border-b border-foreground/10">
				<div className="flex items-center gap-3">
					<StripeLogo />
					<div>
						<h2 className="text-sm font-semibold">Stripe</h2>
						<p className="text-xs text-muted-foreground">
							Credentials for the Stripe driver. Used whenever the active
							provider above is set to Stripe.
						</p>
					</div>
				</div>
				<span
					className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${
						isConfigured
							? "border-primary/30 bg-primary/10 text-primary"
							: "border-foreground/15 bg-muted text-muted-foreground"
					}`}
				>
					{isConfigured
						? initial?.environment === "live"
							? "Live"
							: "Test"
						: "Not configured"}
				</span>
			</header>

			<div className="p-6 space-y-5">
				<p className="text-sm text-muted-foreground max-w-prose">
					Get keys from the{" "}
					<a
						href="https://dashboard.stripe.com/apikeys"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground hover:text-primary underline underline-offset-2"
					>
						Stripe Dashboard
					</a>
					. Environment is detected from the secret key prefix:{" "}
					<span className="font-mono">sk_live_…</span> → Live,{" "}
					<span className="font-mono">sk_test_…</span> → Test.
				</p>

				<div className="space-y-1.5">
					<Label htmlFor="stripe-secret">
						Secret key{" "}
						{isConfigured && (
							<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
								Optional · already saved
							</span>
						)}
					</Label>
					<Input
						id="stripe-secret"
						type="password"
						placeholder={isConfigured ? "Leave blank to keep existing key" : "sk_live_… or sk_test_…"}
						value={secretKey}
						onChange={(e) => setSecretKey(e.target.value)}
						autoComplete="off"
					/>
					<p className="text-[11px] text-muted-foreground">
						Server-side only. Used for charges, refunds, fee lookups.
					</p>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="stripe-publishable">Publishable key</Label>
					<Input
						id="stripe-publishable"
						placeholder="pk_live_… or pk_test_…"
						value={publishableKey}
						onChange={(e) => setPublishableKey(e.target.value)}
						autoComplete="off"
					/>
					<p className="text-[11px] text-muted-foreground">
						Sent to the browser by the checkout pages.
					</p>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="stripe-webhook">Webhook signing secret (optional)</Label>
					<Input
						id="stripe-webhook"
						type="password"
						placeholder={initial?.webhook_signing_secret ? "•••••••• (saved)" : "whsec_…"}
						value={webhookSecret}
						onChange={(e) => setWebhookSecret(e.target.value)}
						autoComplete="off"
					/>
					<p className="text-[11px] text-muted-foreground">
						Used to verify Stripe webhook payloads if you wire any up.
					</p>
				</div>

				{testResult && (
					<div
						className={`text-sm rounded-md border px-3 py-2 ${
							testResult.ok
								? "border-primary/30 bg-primary/5 text-foreground"
								: "border-destructive/30 bg-destructive/5 text-destructive"
						}`}
					>
						{testResult.ok ? (
							<>
								<span className="font-medium">Connected.</span> Environment:{" "}
								<span className="uppercase tracking-[0.15em] text-[10px]">{testResult.env}</span>
								{testResult.currencies?.length > 0 && (
									<> · Currencies: {testResult.currencies.join(", ")}</>
								)}
							</>
						) : (
							<>{testResult.error}</>
						)}
					</div>
				)}
			</div>

			<div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-foreground/10 bg-muted/30">
				{isConfigured && (
					<Button variant="outline" onClick={clear} disabled={saving || testing}>
						Disconnect
					</Button>
				)}
				<Button
					variant="outline"
					onClick={test}
					disabled={saving || testing || (!secretKey && !isConfigured)}
				>
					{testing ? "Testing…" : "Test connection"}
				</Button>
				<Button onClick={save} disabled={saving || testing}>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</section>
	);
}

function StripeLogo() {
	return (
		<div
			className="inline-flex items-center justify-center h-10 w-10 rounded-lg text-white"
			style={{ background: "#635BFF" }}
			aria-label="Stripe"
		>
			<svg
				viewBox="0 0 60 25"
				xmlns="http://www.w3.org/2000/svg"
				className="h-4"
				aria-hidden
			>
				<path
					fill="currentColor"
					d="M59.5 14.4c0-4.2-2-7.5-5.9-7.5s-6.2 3.3-6.2 7.4c0 4.9 2.8 7.4 6.8 7.4 2 0 3.4-.4 4.5-1.1v-3.3c-1.1.6-2.4.9-4 .9-1.6 0-3-.6-3.2-2.5h8c0-.2 0-1 0-1.3zm-8.1-1.6c0-1.8 1.1-2.6 2.1-2.6 1 0 2 .8 2 2.6h-4.1zM41.2 6.9c-1.7 0-2.7.8-3.3 1.3l-.2-1.1H34v18.6l4.2-.9V20c.6.5 1.5 1.2 3 1.2 3 0 5.7-2.4 5.7-7.5 0-4.7-2.7-6.8-5.7-6.8zm-1 11c-1 0-1.6-.4-2-.8l0-6.4c.5-.5 1.1-.8 2-.8 1.5 0 2.6 1.7 2.6 4 0 2.4-1 4-2.6 4zM31.7 5.9V2.5L27.4 3.4v3.5l4.3-.9zm0 1.3h-4.3v14.1h4.3V7.2zM23 8.4l-.3-1.3h-3.7v14.1h4.2v-9.6c1-1.3 2.7-1 3.2-.9V6.9c-.5-.2-2.4-.5-3.4 1.5zM14.8 3.7L10.7 4.6l0 13.7c0 2.5 1.9 4.4 4.4 4.4 1.4 0 2.4-.3 3-.5v-3.4c-.5.2-3 .9-3-1.2v-5.7h3v-3.6h-3l0-4.4zM4.4 11.4c0-.6.5-.9 1.4-.9 1.3 0 2.8.4 4.1 1.1V7.7c-1.4-.6-2.8-.8-4.1-.8C2.4 6.9 0 8.7 0 11.6c0 4.6 6.2 3.8 6.2 5.8 0 .8-.6 1-1.6 1-1.3 0-3.1-.6-4.5-1.4V21c1.5.7 3.1 1 4.5 1 3.5 0 6-1.8 6-4.7-.1-4.9-6.3-4-6.3-5.9z"
				/>
			</svg>
		</div>
	);
}
