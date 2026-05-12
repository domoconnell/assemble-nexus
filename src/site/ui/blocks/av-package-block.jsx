export function AvPackageBlock({ payload }) {
	const name = payload?.name ?? "";
	const summary = payload?.summary ?? "";
	const items = Array.isArray(payload?.items) ? payload.items : [];

	return (
		<div className="rounded-xl border border-foreground/10 bg-card p-6 sm:p-8">
			<div className="flex items-baseline justify-between gap-4 flex-wrap">
				<h3 className="font-display text-2xl sm:text-3xl tracking-tight">{name}</h3>
				<span className="text-[10px] uppercase tracking-[0.22em] text-primary">
					AV package
				</span>
			</div>
			{summary && (
				<p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-2xl">
					{summary}
				</p>
			)}
			{items.length > 0 && (
				<dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
					{items.map((it, i) => (
						<div key={i} className="flex flex-col gap-1 border-t border-foreground/10 pt-3">
							<dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
								{it.label}
							</dt>
							<dd className="text-sm sm:text-base text-foreground/90">{it.value}</dd>
						</div>
					))}
				</dl>
			)}
		</div>
	);
}
