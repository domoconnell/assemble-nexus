"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { Label } from "@/shadcn/components/ui/label";
import { saveBookingAgreementAction } from "../actions";

function emptySection() {
	return { heading: "", paragraphs: [""] };
}

export default function BookingAgreementEditor({ initialAgreement }) {
	const router = useRouter();
	const [doc, setDoc] = useState(() => ({
		id: initialAgreement?.id ?? null,
		title: initialAgreement?.title ?? "Booking Agreement",
		intro: initialAgreement?.intro ?? "",
		version: initialAgreement?.version ?? "",
		sections: Array.isArray(initialAgreement?.sections) && initialAgreement.sections.length
			? initialAgreement.sections.map((s) => ({
				heading: s.heading ?? "",
				paragraphs: Array.isArray(s.paragraphs) && s.paragraphs.length ? s.paragraphs : [""],
			}))
			: [emptySection()],
	}));
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState(null);
	const [error, setError] = useState(null);

	function update(field, value) {
		setDoc((d) => ({ ...d, [field]: value }));
	}

	function setSection(idx, mutator) {
		setDoc((d) => ({
			...d,
			sections: d.sections.map((s, i) => (i === idx ? mutator(s) : s)),
		}));
	}

	function addSection() {
		setDoc((d) => ({ ...d, sections: [...d.sections, emptySection()] }));
	}

	function removeSection(idx) {
		setDoc((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== idx) }));
	}

	function moveSection(idx, dir) {
		setDoc((d) => {
			const next = [...d.sections];
			const swap = dir === "up" ? idx - 1 : idx + 1;
			if (swap < 0 || swap >= next.length) return d;
			[next[idx], next[swap]] = [next[swap], next[idx]];
			return { ...d, sections: next };
		});
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			const saved = await saveBookingAgreementAction(doc);
			setDoc((d) => ({ ...d, id: saved.id }));
			setSavedAt(new Date());
			router.refresh();
		} catch (err) {
			setError(err?.message || "Save failed");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-6">
			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
					{error}
				</div>
			)}

			<div className="rounded-lg border bg-card p-6 space-y-5">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Document</h2>
				<div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
					<div className="space-y-2">
						<Label htmlFor="title">Title</Label>
						<Input id="title" value={doc.title} onChange={(e) => update("title", e.target.value)} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="version">Version (optional)</Label>
						<Input id="version" value={doc.version ?? ""} onChange={(e) => update("version", e.target.value)} placeholder="v1.0" />
					</div>
				</div>
				<div className="space-y-2">
					<Label htmlFor="intro">Intro</Label>
					<Textarea
						id="intro"
						rows={3}
						value={doc.intro ?? ""}
						onChange={(e) => update("intro", e.target.value)}
						placeholder="Shown above the sections, before the customer ticks the accept box."
					/>
				</div>
			</div>

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Sections</h2>
					<Button type="button" variant="outline" size="sm" onClick={addSection}>+ Section</Button>
				</div>
				{doc.sections.map((s, idx) => (
					<div key={idx} className="rounded-lg border bg-card p-6 space-y-4">
						<div className="flex items-center justify-between gap-4">
							<span className="text-xs uppercase tracking-[0.2em] text-primary">
								Section {idx + 1}
							</span>
							<div className="flex gap-1">
								<Button
									variant="ghost"
									size="sm"
									disabled={idx === 0}
									onClick={() => moveSection(idx, "up")}
								>↑</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={idx === doc.sections.length - 1}
									onClick={() => moveSection(idx, "down")}
								>↓</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => removeSection(idx)}
								>Delete</Button>
							</div>
						</div>
						<div className="space-y-2">
							<Label>Heading</Label>
							<Input
								value={s.heading}
								onChange={(e) => setSection(idx, (sec) => ({ ...sec, heading: e.target.value }))}
								placeholder="Health & Safety"
							/>
						</div>
						<div className="space-y-3">
							<Label>Paragraphs</Label>
							{s.paragraphs.map((p, pIdx) => (
								<div key={pIdx} className="flex items-start gap-2">
									<Textarea
										rows={3}
										value={p}
										onChange={(e) =>
											setSection(idx, (sec) => ({
												...sec,
												paragraphs: sec.paragraphs.map((q, j) => (j === pIdx ? e.target.value : q)),
											}))
										}
									/>
									<Button
										variant="ghost"
										size="sm"
										disabled={s.paragraphs.length <= 1}
										onClick={() =>
											setSection(idx, (sec) => ({
												...sec,
												paragraphs: sec.paragraphs.filter((_, j) => j !== pIdx),
											}))
										}
									>
										Remove
									</Button>
								</div>
							))}
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									setSection(idx, (sec) => ({
										...sec,
										paragraphs: [...sec.paragraphs, ""],
									}))
								}
							>
								Add paragraph
							</Button>
						</div>
					</div>
				))}
			</div>

			<div className="flex items-center justify-end gap-3">
				{savedAt && <span className="text-xs text-muted-foreground">Saved.</span>}
				<Button onClick={save} disabled={saving || !doc.title}>
					{saving ? "Saving…" : "Save agreement"}
				</Button>
			</div>
		</div>
	);
}
