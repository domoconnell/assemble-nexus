import { Container } from "./container";

export function Section({
	kicker,
	title,
	intro,
	align = "left",
	className = "",
	children,
	...props
}) {
	const alignClasses = align === "center" ? "items-center text-center mx-auto" : "items-start text-left";
	return (
		<section className={`py-20 lg:py-28 ${className}`} {...props}>
			<Container>
				{(kicker || title || intro) && (
					<div className={`flex flex-col gap-4 max-w-3xl ${alignClasses}`}>
						{kicker && (
							<span className="text-xs uppercase tracking-[0.2em] text-primary font-medium">
								{kicker}
							</span>
						)}
						{title && (
							<h2 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
								{title}
							</h2>
						)}
						{intro && (
							<div className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
								{intro}
							</div>
						)}
					</div>
				)}
				{children && <div className={kicker || title || intro ? "mt-12 lg:mt-16" : ""}>{children}</div>}
			</Container>
		</section>
	);
}
