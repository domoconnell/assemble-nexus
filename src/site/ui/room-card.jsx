import Link from "next/link";
import Image from "next/image";

function summariseCapacities(capacities) {
	if (!Array.isArray(capacities) || capacities.length === 0) return null;
	const sorted = [...capacities].sort((a, b) => b.value - a.value);
	const top = sorted[0];
	return `Up to ${top.value} ${top.label.toLowerCase()}`;
}

export function RoomCard({ room }) {
	const avHighlight = room.av_highlight ?? room.avHighlight;
	const hue = room.accent_hue ?? room.hue ?? "from-cyan-500/15 via-cyan-700/10 to-transparent";
	const heroUrl = room.hero_url;
	const capacityLine = summariseCapacities(room.capacities);

	return (
		<Link
			href={`/rooms/${room.slug}`}
			className="group relative flex flex-col overflow-hidden rounded-xl border border-foreground/10 bg-card transition hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
		>
			<div className={`relative h-56 sm:h-64 overflow-hidden bg-linear-to-br ${hue}`}>
				{heroUrl && (
					<Image
						src={heroUrl}
						alt={room.name}
						fill
						sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
						className="object-cover opacity-80 transition group-hover:opacity-90"
					/>
				)}
				<div className="absolute inset-0 bg-[radial-gradient(50%_60%_at_30%_30%,oklch(1_0_0/0.05)_0%,transparent_70%)]" />
				<div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-card to-transparent" />
				{capacityLine && (
					<div className="absolute left-5 top-5 inline-flex items-center rounded-full border border-foreground/15 bg-background/70 backdrop-blur-sm px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-foreground">
						{capacityLine}
					</div>
				)}
			</div>
			<div className="flex flex-1 flex-col gap-3 p-6">
				<h3 className="font-display text-2xl sm:text-3xl tracking-tight">{room.name}</h3>
				{room.tagline && (
					<p className="text-sm text-muted-foreground leading-relaxed">{room.tagline}</p>
				)}
				<div className="mt-auto flex items-center justify-between pt-4 text-sm">
					{avHighlight && (
						<span className="text-muted-foreground/80 truncate pr-4">
							{avHighlight}
						</span>
					)}
					<span className="shrink-0 font-medium text-primary group-hover:translate-x-0.5 transition">
						Explore →
					</span>
				</div>
			</div>
		</Link>
	);
}
