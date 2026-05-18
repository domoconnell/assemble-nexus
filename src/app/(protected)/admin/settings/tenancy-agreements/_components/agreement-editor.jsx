"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import RichTextEditor from "@/global/ui/components/rich-text-editor";
import { saveTenancyAgreementTemplateAction } from "../actions";

export default function AgreementEditor({ initialHtml }) {
	const router = useRouter();
	const [html, setHtml] = useState(initialHtml ?? "");
	const [saving, setSaving] = useState(false);

	async function save() {
		setSaving(true);
		try {
			await saveTenancyAgreementTemplateAction({ html });
			toast.success("Saved");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Save failed.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-4">
			<div className="rounded-lg border bg-card">
				<RichTextEditor value={html} onChange={setHtml} />
			</div>
			<div className="flex items-center justify-end gap-3">
				<Button onClick={save} disabled={saving}>
					{saving ? "Saving…" : "Save template"}
				</Button>
			</div>
		</div>
	);
}
