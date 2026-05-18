"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import {
	saveGoogleWalletSettingsAction,
	clearGoogleWalletSettingsAction,
} from "../actions";

function fileToText(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.onerror = () => reject(reader.error);
		reader.readAsText(file);
	});
}

export default function GoogleWalletEditor({ initial }) {
	const router = useRouter();
	const fileRef = useRef(null);
	const [issuerId, setIssuerId] = useState(initial?.issuer_id ?? "");
	const [classSuffix, setClassSuffix] = useState(initial?.class_suffix ?? "ticket");
	const [keyFile, setKeyFile] = useState(null);
	const [saving, setSaving] = useState(false);

	const hasExistingKey = Boolean(initial?.service_account_json);
	const uploadedAt = initial?.uploaded_at ? new Date(initial.uploaded_at) : null;

	async function save() {
		setSaving(true);
		try {
			let service_account_json = null;
			if (keyFile) {
				service_account_json = await fileToText(keyFile);
			}
			if (!hasExistingKey && !service_account_json) {
				toast.error("Upload the service-account JSON the first time you save.");
				setSaving(false);
				return;
			}
			await saveGoogleWalletSettingsAction({
				issuer_id: issuerId,
				class_suffix: classSuffix || "ticket",
				service_account_json,
			});
			toast.success("Google Wallet settings saved.");
			setKeyFile(null);
			if (fileRef.current) fileRef.current.value = "";
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't save");
		} finally {
			setSaving(false);
		}
	}

	async function clear() {
		if (!confirm("Remove Google Wallet settings? Existing passes keep working."))
			return;
		setSaving(true);
		try {
			await clearGoogleWalletSettingsAction();
			toast.success("Cleared.");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't clear");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="rounded-lg border bg-card p-6 space-y-5">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div>
					<h2 className="text-sm font-semibold">Google Wallet</h2>
					<p className="text-xs text-muted-foreground mt-1 max-w-prose">
						Issue Google Wallet event tickets. Requires a Google Cloud project with the
						Wallet API enabled, a service-account JSON key, and an Issuer ID.
					</p>
				</div>
				<span
					className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${
						hasExistingKey
							? "border-primary/30 bg-primary/10 text-primary"
							: "border-foreground/15 bg-muted text-muted-foreground"
					}`}
				>
					{hasExistingKey ? "Configured" : "Not configured"}
				</span>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor="gw-issuer">Issuer ID</Label>
					<Input
						id="gw-issuer"
						placeholder="3388000000022000000"
						value={issuerId}
						onChange={(e) => setIssuerId(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="gw-class">Class suffix</Label>
					<Input
						id="gw-class"
						placeholder="ticket"
						value={classSuffix}
						onChange={(e) => setClassSuffix(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5 sm:col-span-2">
					<Label htmlFor="gw-key">
						Service-account key (.json){" "}
						{hasExistingKey && (
							<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
								Optional · already uploaded
							</span>
						)}
					</Label>
					<Input
						ref={fileRef}
						id="gw-key"
						type="file"
						accept="application/json,.json"
						onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)}
					/>
					<p className="text-[11px] text-muted-foreground">
						Generated in Google Cloud Console → IAM &amp; Admin → Service Accounts.
					</p>
				</div>
			</div>

			{uploadedAt && (
				<p className="text-xs text-muted-foreground">
					Key uploaded {uploadedAt.toLocaleString("en-GB")}.
				</p>
			)}

			<div className="flex items-center justify-end gap-2 pt-2 border-t border-foreground/10">
				{hasExistingKey && (
					<Button variant="outline" onClick={clear} disabled={saving}>
						Disconnect
					</Button>
				)}
				<Button onClick={save} disabled={saving}>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</section>
	);
}
