import Link from "next/link";
import { Container } from "@/site/ui/container";
import { Logo } from "@/site/ui/logo";

export function SiteFooter({ rooms = [], hasUpcomingEvents = false }) {
	const columns = [];

	const visitLinks = [
		{ label: "Find us", href: "/about#location" },
		{ label: "Café", href: "/about#cafe" },
		{ label: "Accessibility", href: "/about#accessibility" },
	];
	if (hasUpcomingEvents) {
		visitLinks.push({ label: "Upcoming events", href: "/whats-on" });
	}
	columns.push({ title: "Visit", links: visitLinks });

	const hireLinks = [];
	for (const r of rooms) {
		hireLinks.push({ label: r.name, href: `/rooms/${r.slug}` });
	}
	hireLinks.push({ label: "Book a room", href: "/book" });
	columns.push({ title: "Hire", links: hireLinks });

	columns.push({
		title: "Connect",
		links: [
			{ label: "Help", href: "/help" },
			{ label: "Contact", href: "/contact" },
			{ label: "Assemble Church", href: "https://www.assemblechurch.com", external: true },
		],
	});

	return (
		<footer className="border-t border-foreground/10 mt-24">
			<Container>
				<div className="grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-5">
					<div className="lg:col-span-2 max-w-sm">
						<Logo size="lg" />
						<p className="mt-6 text-sm text-muted-foreground leading-relaxed">
							A music venue and corporate hire space at the heart of Assemble Church.
							Three rooms, a working café, and a team that knows the room.
						</p>
					</div>
					{columns.map((col) => (
						<div key={col.title}>
							<h3 className="text-xs uppercase tracking-[0.22em] text-foreground/70 font-medium">
								{col.title}
							</h3>
							<ul className="mt-4 space-y-2.5">
								{col.links.map((l) => (
									<li key={l.href + l.label}>
										{l.external ? (
											<a
												href={l.href}
												target="_blank"
												rel="noopener noreferrer"
												className="text-sm text-muted-foreground hover:text-foreground transition"
											>
												{l.label}
											</a>
										) : (
											<Link
												href={l.href}
												className="text-sm text-muted-foreground hover:text-foreground transition"
											>
												{l.label}
											</Link>
										)}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
				<div className="border-t border-foreground/10 py-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
					<span>© {new Date().getFullYear()} The Assembly Rooms. All rights reserved.</span>
					<div className="flex gap-6">
						<Link href="/about" className="hover:text-foreground transition">
							About
						</Link>
						<Link href="/contact" className="hover:text-foreground transition">
							Contact
						</Link>
						<a
							href="https://www.assemblechurch.com"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-foreground transition"
						>
							Assemble Church ↗
						</a>
					</div>
				</div>
			</Container>
		</footer>
	);
}
