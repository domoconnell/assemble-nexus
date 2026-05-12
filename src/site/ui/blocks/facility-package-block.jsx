const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatGbp = (c) => gbp.format((c ?? 0) / 100);

export function FacilityPackageBlock({ pkg }) {
	const items = Array.isArray(pkg.items) ? pkg.items : [];
	const showPrice = (pkg.price_cents ?? 0) > 0;

	return (
		<div className="rounded-xl border border-foreground/10 bg-card p-6 sm:p-8">
			<div className="flex items-baseline justify-between gap-4 flex-wrap">
				<h3 className="font-display text-2xl sm:text-3xl tracking-tight">{pkg.name}</h3>
				{showPrice && (
					<span className="font-display text-xl sm:text-2xl text-primary">
						{formatGbp(pkg.price_cents)}
					</span>
				)}
			</div>
			{pkg.summary && (
				<p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-2xl">
					{pkg.summary}
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
