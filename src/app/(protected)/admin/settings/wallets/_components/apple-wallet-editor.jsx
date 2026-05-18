"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import {
	saveAppleWalletSettingsAction,
	clearAppleWalletSettingsAction,
} from "../actions";

function fileToBase64(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			// FileReader returns a data URL - strip the prefix.
			const comma = String(result).indexOf(",");
			resolve(comma >= 0 ? String(result).slice(comma + 1) : String(result));
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

export default function AppleWalletEditor({ initial }) {
	const router = useRouter();
	const fileRef = useRef(null);
	const [passTypeId, setPassTypeId] = useState(initial?.pass_type_identifier ?? "");
	const [teamId, setTeamId] = useState(initial?.team_identifier ?? "");
	const [orgName, setOrgName] = useState(initial?.organisation_name ?? "");
	const [p12File, setP12File] = useState(null);
	const [passphrase, setPassphrase] = useState("");
	const [saving, setSaving] = useState(false);

	const hasExistingCert = Boolean(initial?.signer_cert_pem);
	const uploadedAt = initial?.uploaded_at ? new Date(initial.uploaded_at) : null;

	async function save() {
		setSaving(true);
		try {
			let p12_base64 = null;
			if (p12File) {
				p12_base64 = await fileToBase64(p12File);
			}
			if (!hasExistingCert && !p12_base64) {
				toast.error(
					"Upload a .p12 file the first time you save these settings.",
				);
				setSaving(false);
				return;
			}
			await saveAppleWalletSettingsAction({
				pass_type_identifier: passTypeId,
				team_identifier: teamId,
				organisation_name: orgName,
				p12_base64,
				p12_passphrase: passphrase || null,
			});
			toast.success("Apple Wallet settings saved.");
			setP12File(null);
			setPassphrase("");
			if (fileRef.current) fileRef.current.value = "";
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't save");
		} finally {
			setSaving(false);
		}
	}

	async function clear() {
		if (!confirm("Remove Apple Wallet settings? Existing passes will continue to work; new ones won't be issued."))
			return;
		setSaving(true);
		try {
			await clearAppleWalletSettingsAction();
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
					<h2 className="text-sm font-semibold">Apple Wallet</h2>
					<p className="text-xs text-muted-foreground mt-1 max-w-prose">
						Issue signed <span className="font-mono text-foreground/80">.pkpass</span> tickets that
						customers can add to Apple Wallet on iPhone. Requires an Apple Developer Pass Type ID +
						certificate.
					</p>
				</div>
				<span
					className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${
						hasExistingCert
							? "border-primary/30 bg-primary/10 text-primary"
							: "border-foreground/15 bg-muted text-muted-foreground"
					}`}
				>
					{hasExistingCert ? "Connected" : "Not configured"}
				</span>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor="aw-pass-type">Pass Type Identifier</Label>
					<Input
						id="aw-pass-type"
						placeholder="pass.com.assemblerooms.ticket"
						value={passTypeId}
						onChange={(e) => setPassTypeId(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="aw-team">Team Identifier</Label>
					<Input
						id="aw-team"
						placeholder="A1B2C3D4E5"
						value={teamId}
						onChange={(e) => setTeamId(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5 sm:col-span-2">
					<Label htmlFor="aw-org">Organisation Name (shown on the pass)</Label>
					<Input
						id="aw-org"
						placeholder="The Assembly Rooms"
						value={orgName}
						onChange={(e) => setOrgName(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="aw-p12">
						Signing certificate (.p12){" "}
						{hasExistingCert && (
							<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
								Optional · already uploaded
							</span>
						)}
					</Label>
					<Input
						ref={fileRef}
						id="aw-p12"
						type="file"
						accept=".p12,application/x-pkcs12"
						onChange={(e) => setP12File(e.target.files?.[0] ?? null)}
					/>
					<p className="text-[11px] text-muted-foreground">
						Exported from Keychain Access on macOS.
					</p>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="aw-passphrase">Certificate passphrase</Label>
					<Input
						id="aw-passphrase"
						type="password"
						placeholder={hasExistingCert ? "Only needed when re-uploading" : ""}
						value={passphrase}
						onChange={(e) => setPassphrase(e.target.value)}
						autoComplete="new-password"
					/>
				</div>
			</div>

			{uploadedAt && (
				<p className="text-xs text-muted-foreground">
					Certificate uploaded {uploadedAt.toLocaleString("en-GB")}.
				</p>
			)}

			<div className="flex items-center justify-end gap-2 pt-2 border-t border-foreground/10">
				{hasExistingCert && (
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
