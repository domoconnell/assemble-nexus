"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Container } from "@/site/ui/container";
import { CtaButton } from "@/site/ui/cta-button";
import { Logo } from "@/site/ui/logo";

function isActive(pathname, href) {
	if (href === "/") return pathname === "/";
	return pathname === href || pathname.startsWith(href + "/");
}

export function SiteHeader({ navItems = [] }) {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);

	return (
		<header className="sticky top-0 z-40 border-b border-foreground/10 bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/65">
			<Container>
				<div className="flex h-24 items-center justify-between gap-6">
					<div onClick={() => setOpen(false)}>
						<Logo size="xl" priority />
					</div>
					<nav className="hidden md:flex items-center gap-1">
						{navItems.map((item) => {
							const active = isActive(pathname, item.href);
							return (
								<Link
									key={item.href}
									href={item.href}
									className={`relative px-3 py-2 text-sm transition ${
										active
											? "text-foreground"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									{item.label}
									{active && (
										<span
											aria-hidden
											className="absolute inset-x-3 -bottom-px h-px bg-primary"
										/>
									)}
								</Link>
							);
						})}
					</nav>
					<div className="hidden md:block">
						<CtaButton href="/book" size="md">
							Book a room
						</CtaButton>
					</div>
					<button
						type="button"
						className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md border border-foreground/15 text-foreground/80"
						aria-label="Toggle menu"
						aria-expanded={open}
						onClick={() => setOpen((v) => !v)}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							className="h-5 w-5"
						>
							{open ? (
								<path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
							) : (
								<path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
							)}
						</svg>
					</button>
				</div>
				{open && (
					<div className="md:hidden border-t border-foreground/10 py-4">
						<nav className="flex flex-col gap-1">
							{navItems.map((item) => {
								const active = isActive(pathname, item.href);
								return (
									<Link
										key={item.href}
										href={item.href}
										onClick={() => setOpen(false)}
										className={`rounded-md px-3 py-2 text-base transition ${
											active
												? "bg-foreground/5 text-foreground"
												: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
										}`}
									>
										{item.label}
									</Link>
								);
							})}
							<CtaButton
								href="/book"
								size="md"
								className="mt-3 w-full"
								onClick={() => setOpen(false)}
							>
								Book a room
							</CtaButton>
						</nav>
					</div>
				)}
			</Container>
		</header>
	);
}
