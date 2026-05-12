"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useCallback } from "react";
import { Button } from "@/shadcn/components/ui/button";

const TOOLBAR_BTN =
	"inline-flex items-center justify-center w-8 h-8 rounded text-sm hover:bg-foreground/10 disabled:opacity-50";

export default function RichTextEditor({ value, onChange }) {
	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: false,
				codeBlock: false,
				blockquote: false,
				horizontalRule: false,
				strike: false,
			}),
			Link.configure({
				openOnClick: false,
				autolink: false,
			}),
		],
		content: value || "",
		editorProps: {
			attributes: {
				class:
					"prose prose-sm max-w-none focus:outline-none min-h-24 px-3 py-2.5 [&_p]:my-1",
			},
		},
		immediatelyRender: false,
		onUpdate({ editor: ed }) {
			const html = ed.getHTML();
			// Empty editor reports `<p></p>` — normalise to empty string.
			onChange?.(html === "<p></p>" ? "" : html);
		},
	});

	const addLink = useCallback(() => {
		if (!editor) return;
		const prev = editor.getAttributes("link").href ?? "";
		const url = window.prompt("Link URL", prev);
		if (url === null) return;
		if (url === "") {
			editor.chain().focus().unsetLink().run();
			return;
		}
		editor.chain().focus().setLink({ href: url }).run();
	}, [editor]);

	if (!editor) return null;

	return (
		<div className="rounded-md border border-input bg-background">
			<div className="flex items-center gap-1 border-b border-input px-2 py-1.5">
				<button
					type="button"
					className={`${TOOLBAR_BTN} ${editor.isActive("bold") ? "bg-foreground/10" : ""}`}
					onClick={() => editor.chain().focus().toggleBold().run()}
					aria-label="Bold"
				>
					<strong>B</strong>
				</button>
				<button
					type="button"
					className={`${TOOLBAR_BTN} italic ${editor.isActive("italic") ? "bg-foreground/10" : ""}`}
					onClick={() => editor.chain().focus().toggleItalic().run()}
					aria-label="Italic"
				>
					I
				</button>
				<button
					type="button"
					className={`${TOOLBAR_BTN} ${editor.isActive("bulletList") ? "bg-foreground/10" : ""}`}
					onClick={() => editor.chain().focus().toggleBulletList().run()}
					aria-label="Bulleted list"
				>
					•
				</button>
				<button
					type="button"
					className={`${TOOLBAR_BTN} ${editor.isActive("orderedList") ? "bg-foreground/10" : ""}`}
					onClick={() => editor.chain().focus().toggleOrderedList().run()}
					aria-label="Numbered list"
				>
					1.
				</button>
				<span className="mx-1 h-5 w-px bg-foreground/10" />
				<button
					type="button"
					className={`${TOOLBAR_BTN} text-xs ${editor.isActive("link") ? "bg-foreground/10" : ""}`}
					onClick={addLink}
					aria-label="Link"
				>
					🔗
				</button>
				{editor.isActive("link") && (
					<button
						type="button"
						className={`${TOOLBAR_BTN} text-xs`}
						onClick={() => editor.chain().focus().unsetLink().run()}
						aria-label="Remove link"
					>
						⊘
					</button>
				)}
			</div>
			<EditorContent editor={editor} />
		</div>
	);
}
