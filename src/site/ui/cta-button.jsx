import { forwardRef } from "react";
import Link from "next/link";

const variants = {
	primary:
		"bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/40",
	outline:
		"border border-foreground/20 text-foreground hover:bg-foreground/5 focus-visible:ring-foreground/30",
	ghost:
		"text-foreground/80 hover:text-foreground hover:bg-foreground/5 focus-visible:ring-foreground/20",
};

const sizes = {
	md: "h-11 px-6 text-sm",
	lg: "h-12 px-8 text-base",
};

export const CtaButton = forwardRef(function CtaButton(
	{ href, variant = "primary", size = "md", className = "", children, ...props },
	ref,
) {
	const cls = `inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`;
	if (href) {
		return (
			<Link ref={ref} href={href} className={cls} {...props}>
				{children}
			</Link>
		);
	}
	return (
		<button ref={ref} type="button" className={cls} {...props}>
			{children}
		</button>
	);
});
