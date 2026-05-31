"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Label } from "@/shadcn/components/ui/label";
import { Input } from "@/shadcn/components/ui/input";
import RichTextEditor from "@/global/ui/components/rich-text-editor";
import {
	createDraftAgreementAction,
	updateDraftAgreementAction,
	sendAgreementAction,
	cancelAgreementAction,
} from "../actions";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric", month: "short", year: "numeric",
	hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
});

const STATUS_STYLES = {
	draft: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	sent: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	signed: "border-primary/30 bg-primary/10 text-primary",
	cancelled: "border-foreground/15 text-muted-foreground",
};

function StatusBadge({ status }) {
	return (
		<span
			className={`text-[10px] uppercase tracking-[0.18em] rounded-full border px-2 py-0.5 ${
				STATUS_STYLES[status] || STATUS_STYLES.cancelled
			}`}
		>
			{status}
		</span>
	);
}

export default function AgreementsSection({ tenancy, agreements }) {
	const router = useRouter();
	const [editingId, setEditingId] = useState(null);
	const [editingHtml, setEditingHtml] = useState("");
	const [savingDraft, setSavingDraft] = useState(false);
	const [creating, setCreating] = useState(false);
	const [sendingId, setSendingId] = useState(null);
	const [cancellingId, setCancellingId] = useState(null);
	const [cancelReason, setCancelReason] = useState("");
	const [cancelBusy, setCancelBusy] = useState(false);

	// A draft or sent agreement is "in flight" - those block a new draft
	// because the tenant would otherwise have two live links at once. A
	// signed agreement does NOT block: admin can supersede it with a new one.
	const hasPendingAgreement = agreements.some(
		(a) => a.status === "draft" || a.status === "sent",
	);

	function startEdit(ag) {
		setEditingId(ag.id);
		setEditingHtml(ag.html ?? "");
	}

	async function saveDraft() {
		if (!editingId) return;
		setSavingDraft(true);
		try {
			await updateDraftAgreementAction({ id: editingId, html: editingHtml });
			toast.success("Draft saved");
			setEditingId(null);
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not save draft.");
		} finally {
			setSavingDraft(false);
		}
	}

	async function createDraft() {
		setCreating(true);
		try {
			await createDraftAgreementAction(tenancy.id);
			toast.success("Draft agreement created");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not create draft.");
		} finally {
			setCreating(false);
		}
	}

	async function sendOne(ag) {
		setSendingId(ag.id);
		try {
			await sendAgreementAction(ag.id);
			toast.success("Agreement sent");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not send agreement.");
		} finally {
			setSendingId(null);
		}
	}

	async function doCancel(id) {
		setCancelBusy(true);
		try {
			await cancelAgreementAction({
				id,
				reason: cancelReason.trim() || null,
			});
			toast.success("Agreement cancelled");
			setCancellingId(null);
			setCancelReason("");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Could not cancel agreement.");
		} finally {
			setCancelBusy(false);
		}
	}

	return (
		<section className="space-y-3">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
					Agreements · {agreements.length}
				</h2>
				<Button
					size="sm"
					onClick={createDraft}
					disabled={creating || hasPendingAgreement}
					title={
						hasPendingAgreement
							? "Cancel the current draft / sent agreement before creating a new one."
							: undefined
					}
				>
					{creating ? "Creating…" : "New draft"}
				</Button>
			</div>

			{agreements.length === 0 ? (
				<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
					No agreements yet. Click <em>New draft</em> to create one from the
					template.
				</div>
			) : (
				<ul className="rounded-lg border bg-card divide-y divide-foreground/10 overflow-hidden">
					{agreements.map((ag) => {
						const isEditing = editingId === ag.id;
						const publicLink = `/tenancy/agreement/${ag.token}`;
						return (
							<li key={ag.id} className="p-4 space-y-3">
								<div className="flex items-baseline justify-between gap-3 flex-wrap">
									<div className="flex items-baseline gap-2">
										<StatusBadge status={ag.status} />
										<span className="text-xs text-muted-foreground">
											Created {dateTimeFmt.format(new Date(ag.createdAt))}
										</span>
									</div>
									<div className="flex items-center gap-2">
										<a
											href={publicLink}
											target="_blank"
											rel="noreferrer"
											className="text-xs text-muted-foreground hover:text-foreground underline"
										>
											View →
										</a>
										{ag.status === "draft" && !isEditing && (
											<>
												<Button
													size="sm"
													variant="outline"
													onClick={() => startEdit(ag)}
												>
													Edit
												</Button>
												<Button
													size="sm"
													onClick={() => sendOne(ag)}
													disabled={sendingId === ag.id}
												>
													{sendingId === ag.id ? "Sending…" : "Send"}
												</Button>
											</>
										)}
										{ag.status !== "cancelled" &&
											!isEditing &&
											cancellingId !== ag.id && (
												<Button
													size="sm"
													variant="ghost"
													onClick={() => {
														setCancellingId(ag.id);
														setCancelReason("");
													}}
												>
													{ag.status === "signed" ? "Supersede" : "Cancel"}
												</Button>
											)}
									</div>
								</div>

								{ag.status === "sent" && (
									<div className="text-xs text-muted-foreground">
										Sent {ag.sent_at ? dateTimeFmt.format(new Date(ag.sent_at)) : "-"}
									</div>
								)}
								{ag.status === "signed" && (
									<div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
										<span>
											Signed by {ag.signed_by_name} on{" "}
											{ag.signed_at ? dateTimeFmt.format(new Date(ag.signed_at)) : "-"}
										</span>
										{ag.pdf_file_id && (
											<a
												href={`/api/files/${ag.pdf_file_id}/download`}
												className="text-primary hover:underline"
												target="_blank"
												rel="noreferrer"
											>
												Download signed PDF →
											</a>
										)}
									</div>
								)}
								{ag.status === "cancelled" && (
									<div className="text-xs text-muted-foreground">
										Cancelled{" "}
										{ag.cancelled_at ? dateTimeFmt.format(new Date(ag.cancelled_at)) : "-"}
										{ag.cancelled_reason ? ` · ${ag.cancelled_reason}` : ""}
									</div>
								)}

								{cancellingId === ag.id && (
									<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
										<div className="text-xs text-destructive font-medium">
											{ag.status === "signed"
												? "Supersede this signed agreement?"
												: "Cancel this agreement?"}
										</div>
										<div className="text-xs text-muted-foreground">
											{ag.status === "sent" &&
												"The tenant will be emailed letting them know not to act on the previous link."}
											{ag.status === "draft" &&
												"This draft has not been sent yet, so the tenant won't be notified."}
											{ag.status === "signed" &&
												"The signing record stays on file, but this agreement will be flagged superseded. You can then issue a new one."}
										</div>
										<Label htmlFor={`reason-${ag.id}`} className="text-xs">
											Reason (optional, shown to tenant)
										</Label>
										<Input
											id={`reason-${ag.id}`}
											value={cancelReason}
											onChange={(e) => setCancelReason(e.target.value)}
											placeholder={
												ag.status === "signed"
													? "e.g. New terms agreed - fresh version on the way"
													: "e.g. Terms have changed - new version on the way"
											}
										/>
										<div className="flex items-center gap-2">
											<Button
												size="sm"
												variant="destructive"
												onClick={() => doCancel(ag.id)}
												disabled={cancelBusy}
											>
												{cancelBusy
													? "Working…"
													: ag.status === "signed"
														? "Supersede"
														: "Cancel agreement"}
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => {
													setCancellingId(null);
													setCancelReason("");
												}}
												disabled={cancelBusy}
											>
												Keep
											</Button>
										</div>
									</div>
								)}

								{isEditing && (
									<div className="space-y-2">
										<Label>Agreement content</Label>
										<RichTextEditor
											value={editingHtml}
											onChange={setEditingHtml}
										/>
										<div className="flex items-center gap-2">
											<Button size="sm" onClick={saveDraft} disabled={savingDraft}>
												{savingDraft ? "Saving…" : "Save draft"}
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setEditingId(null)}
												disabled={savingDraft}
											>
												Discard
											</Button>
										</div>
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}

		</section>
	);
}
