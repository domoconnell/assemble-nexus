"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Label } from "@/shadcn/components/ui/label";
import FileUpload from "@/global/ui/components/file-upload";
import RichTextEditor from "@/global/ui/components/rich-text-editor";
import { savePageContentAction } from "./actions";

export default function CmsEditor({ pageKey, schema, initialContent }) {
	const [content, setContent] = useState(initialContent ?? {});
	const [pending, startTransition] = useTransition();

	function setField(sectionKey, fieldKey, value) {
		setContent((prev) => ({
			...prev,
			[sectionKey]: {
				...(prev[sectionKey] ?? {}),
				[fieldKey]: value,
			},
		}));
	}

	function setImage(sectionKey, fieldKey, record) {
		setContent((prev) => ({
			...prev,
			[sectionKey]: {
				...(prev[sectionKey] ?? {}),
				[fieldKey]: record?.id ?? null,
				[`${fieldKey}_url`]: record?.public_url ?? null,
			},
		}));
	}

	function clearImage(sectionKey, fieldKey) {
		setContent((prev) => {
			const sec = { ...(prev[sectionKey] ?? {}) };
			delete sec[fieldKey];
			delete sec[`${fieldKey}_url`];
			return { ...prev, [sectionKey]: sec };
		});
	}

	function save() {
		// Strip the auto-resolved `*_url` helper fields before sending.
		const payload = {};
		for (const [sk, fields] of Object.entries(content)) {
			payload[sk] = {};
			for (const [fk, v] of Object.entries(fields)) {
				if (fk.endsWith("_url")) continue;
				payload[sk][fk] = v;
			}
		}
		startTransition(async () => {
			try {
				await savePageContentAction({ page_key: pageKey, content: payload });
				toast.success("Saved");
			} catch (err) {
				toast.error(err?.message || "Couldn't save");
			}
		});
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between sticky top-0 z-10 bg-background py-2 -my-2 border-b border-foreground/10">
				<h2 className="font-display text-xl tracking-tight">{schema.label}</h2>
				<Button onClick={save} disabled={pending}>
					{pending ? "Saving…" : "Save changes"}
				</Button>
			</div>

			{schema.sections.map((section) => (
				<section
					key={section.key}
					className="rounded-lg border bg-card p-6 space-y-5"
				>
					<h3 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
						{section.label}
					</h3>

					{section.fields.map((field) => {
						const value = content[section.key]?.[field.key] ?? "";
						const imageUrl = content[section.key]?.[`${field.key}_url`] ?? null;
						return (
							<div key={field.key} className="space-y-1.5">
								<Label>{field.label}</Label>
								{field.type === "text" && (
									<Input
										value={value}
										onChange={(e) => setField(section.key, field.key, e.target.value)}
									/>
								)}
								{field.type === "longtext" && (
									<Textarea
										rows={3}
										value={value}
										onChange={(e) => setField(section.key, field.key, e.target.value)}
									/>
								)}
								{field.type === "richtext" && (
									<RichTextEditor
										value={value}
										onChange={(html) => setField(section.key, field.key, html)}
									/>
								)}
								{field.type === "image" && (
									<div className="space-y-3">
										{imageUrl && (
											<div className="relative aspect-3/1 max-w-md overflow-hidden rounded-md border border-foreground/10 bg-muted/30">
												{/* eslint-disable-next-line @next/next/no-img-element */}
												<img
													src={imageUrl}
													alt=""
													className="absolute inset-0 w-full h-full object-cover"
												/>
											</div>
										)}
										<div className="flex items-center gap-2">
											<FileUpload
												fileType="event-hero"
												accept="image/*"
												label={imageUrl ? "Replace image" : "Upload image"}
												onUploaded={(record) => setImage(section.key, field.key, record)}
											/>
											{imageUrl && (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => clearImage(section.key, field.key)}
												>
													Remove
												</Button>
											)}
										</div>
									</div>
								)}
							</div>
						);
					})}
				</section>
			))}

			<div className="flex justify-end pt-2">
				<Button onClick={save} disabled={pending}>
					{pending ? "Saving…" : "Save changes"}
				</Button>
			</div>
		</div>
	);
}
