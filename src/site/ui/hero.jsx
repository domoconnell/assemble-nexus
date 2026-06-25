import Image from "next/image";
import { Container } from "./container";

export function Hero({
	kicker,
	title,
	subtitle,
	actions,
	align = "left",
	hue = "from-cyan-500/20 via-cyan-700/12 to-transparent",
	height = "tall",
	backgroundImage,
	backgroundAlt = "",
	backgroundGreyscale = true,
	backgroundOverlay = true,
	children,
}) {
	const alignWrap = align === "center" ? "items-center text-center" : "items-start text-left";
	const heights = {
		tall: "py-24 lg:py-32",
		medium: "py-20 lg:py-24",
		short: "py-12 lg:py-20",
	};
	return (
		<section className={`relative overflow-hidden ${heights[height]}`}>
			{backgroundImage && (
				<div aria-hidden className="absolute inset-0 pointer-events-none">
					<Image
						src={backgroundImage}
						alt={backgroundAlt}
						fill
						priority
						sizes="100vw"
						className={`object-cover object-left opacity-60 ${backgroundGreyscale ? "grayscale" : ""}`}
					/>
				</div>
			)}
			{backgroundImage && backgroundOverlay && (
				<div
					aria-hidden
					className="absolute inset-0 bg-linear-to-r from-background from-0% via-background/90 via-55% to-transparent pointer-events-none"
				/>
			)}
			<div
				aria-hidden
				className={`absolute inset-0 bg-linear-to-br ${hue} pointer-events-none`}
			/>
			<div
				aria-hidden
				className="absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,oklch(0.82_0.13_192/0.08)_0%,transparent_70%)] pointer-events-none"
			/>
			<div
				aria-hidden
				className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-foreground/15 to-transparent"
			/>
			<Container className="relative h-full flex flex-col justify-center">
				<div className={`flex flex-col gap-6 w-full ${alignWrap}`}>
					{kicker && (
						<span className="text-xs uppercase tracking-[0.24em] text-primary font-medium">
							{kicker}
						</span>
					)}
					{title && (
						<h1 className="font-display text-5xl sm:text-6xl lg:text-7xl xl:text-8xl leading-[0.98] tracking-tight">
							{title}
						</h1>
					)}
					{subtitle && (
						<div className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl">
							{subtitle}
						</div>
					)}
					{actions && <div className="mt-2 flex flex-wrap gap-3">{actions}</div>}
					{children}
				</div>
			</Container>
		</section>
	);
}
