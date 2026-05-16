"use client";

import { useState } from "react";
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
	saveSquareSettingsAction,
	clearSquareSettingsAction,
	testSquareSettingsAction,
} from "../actions";

export default function SquareEditor({ initial }) {
	const router = useRouter();
	const [accessToken, setAccessToken] = useState("");
	const [locationId, setLocationId] = useState(initial?.location_id ?? "");
	const [environment, setEnvironment] = useState(initial?.environment ?? "sandbox");
	const [locationLabel, setLocationLabel] = useState(initial?.location_label ?? "");
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState(null);

	const isConfigured = Boolean(initial?.access_token && initial?.location_id);

	async function save() {
		setSaving(true);
		setTestResult(null);
		try {
			await saveSquareSettingsAction({
				access_token: accessToken || null,
				location_id: locationId,
				environment,
				location_label: locationLabel || null,
			});
			toast.success("Square settings saved.");
			setAccessToken("");
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
			const result = await testSquareSettingsAction({
				access_token: accessToken || null,
				location_id: locationId,
				environment,
			});
			setTestResult(result);
			if (result.ok) {
				toast.success(`Connected to ${result.location_name ?? "location"} (${result.env}).`);
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
		if (!confirm("Disconnect Square? You can reconnect anytime.")) return;
		setSaving(true);
		try {
			await clearSquareSettingsAction();
			toast.success("Disconnected.");
			setAccessToken("");
			setLocationId("");
			setEnvironment("sandbox");
			setLocationLabel("");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't disconnect");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="rounded-lg border bg-card overflow-hidden">
			<header className="flex items-center justify-between gap-3 px-6 py-5 bg-linear-to-r from-black/10 via-black/5 to-transparent border-b border-foreground/10">
				<div className="flex items-center gap-3">
					<SquareLogo />
					<div>
						<h2 className="text-sm font-semibold">Square</h2>
						<p className="text-xs text-muted-foreground">
							Café & bar POS sync.
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
					{isConfigured ? "Connected" : "Not connected"}
				</span>
			</header>

			<div className="p-6 space-y-5">
				<p className="text-sm text-muted-foreground max-w-prose">
					Paste an access token from the{" "}
					<a
						href="https://developer.squareup.com/apps"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground hover:text-primary underline underline-offset-2"
					>
						Square Developer Dashboard
					</a>
					, the Location ID for the venue&apos;s till, and pick the environment.
					We read Orders, Payments and Refunds - no writes.
				</p>

				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1.5 sm:col-span-2">
						<Label htmlFor="sq-token">
							Access token{" "}
							{isConfigured && (
								<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
									Optional · already saved
								</span>
							)}
						</Label>
						<Input
							id="sq-token"
							type="password"
							placeholder={isConfigured ? "Leave blank to keep existing token" : "EAAA…"}
							value={accessToken}
							onChange={(e) => setAccessToken(e.target.value)}
							autoComplete="off"
						/>
						<p className="text-[11px] text-muted-foreground">
							For sandbox use a sandbox token; for production use a production
							token from the same Application.
						</p>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="sq-location">Location ID</Label>
						<Input
							id="sq-location"
							placeholder="LXXXXXXXXXXXX"
							value={locationId}
							onChange={(e) => setLocationId(e.target.value)}
							autoComplete="off"
						/>
						<p className="text-[11px] text-muted-foreground">
							Square Developer Dashboard → your app → Locations.
						</p>
					</div>
					<div className="space-y-1.5">
						<Label>Environment</Label>
						<Select value={environment} onValueChange={setEnvironment}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="sandbox">Sandbox (test)</SelectItem>
								<SelectItem value="production">Production (live)</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5 sm:col-span-2">
						<Label htmlFor="sq-label">Location label (optional)</Label>
						<Input
							id="sq-label"
							placeholder="e.g. Café front-of-house"
							value={locationLabel}
							onChange={(e) => setLocationLabel(e.target.value)}
						/>
					</div>
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
								<span className="font-medium">Connected.</span>{" "}
								Location: {testResult.location_name ?? "-"} ·{" "}
								<span className="uppercase tracking-[0.15em] text-[10px]">
									{testResult.env}
								</span>
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
					disabled={saving || testing || !locationId}
				>
					{testing ? "Testing…" : "Test connection"}
				</Button>
				<Button onClick={save} disabled={saving || testing || !locationId}>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</section>
	);
}

function SquareLogo() {
	return (
		<div
			className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-foreground text-background"
			aria-label="Square"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				className="h-5 w-5"
				aria-hidden
			>
				<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2.5" />
				<rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
			</svg>
		</div>
	);
}
