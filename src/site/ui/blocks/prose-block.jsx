export function ProseBlock({ payload }) {
	const paragraphs = Array.isArray(payload?.paragraphs) ? payload.paragraphs : [];
	if (!paragraphs.length) return null;
	return (
		<div className="space-y-4 max-w-3xl">
			{paragraphs.map((p, i) => (
				<p key={i} className="text-base sm:text-lg leading-relaxed text-foreground/85">
					{p}
				</p>
			))}
		</div>
	);
}
