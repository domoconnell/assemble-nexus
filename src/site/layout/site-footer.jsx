import Link from "next/link";
import { Container } from "@/site/ui/container";
import { Logo } from "@/site/ui/logo";

export function SiteFooter({
	rooms = [],
	hasUpcomingEvents = false,
	phone = null,
	contactEmail = null,
	addressLines = null,
}) {
	const addressOneLine = Array.isArray(addressLines)
		? addressLines.filter(Boolean).join(", ")
		: "";

	const visitLinks = [
		{ label: "Find us", href: "/about#location" },
		{ label: "Café", href: "/about#cafe" },
		{ label: "Accessibility", href: "/about#accessibility" },
	];
	if (hasUpcomingEvents) {
		visitLinks.push({ label: "Upcoming events", href: "/whats-on" });
	}

	const hireLinks = [];
	for (const r of rooms) {
		hireLinks.push({ label: r.name, href: `/rooms/${r.slug}` });
	}
	hireLinks.push({ label: "Book a room", href: "/book" });

	const connectLinks = [
		{ label: "Help", href: "/help" },
		{ label: "Contact", href: "/contact" },
		{ label: "Assemble Church", href: "https://www.assemblechurch.com", external: true },
	];

	const columns = [
		{ title: "Visit", links: visitLinks },
		{ title: "Hire", links: hireLinks },
	];

	const year = new Date().getFullYear();

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

					<div>
						<h3 className="text-xs uppercase tracking-[0.22em] text-foreground/70 font-medium">
							Connect
						</h3>
						<ul className="mt-4 space-y-2.5">
							{connectLinks.map((l) => (
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
							{contactEmail && (
								<li>
									<a
										href={`mailto:${contactEmail}`}
										className="text-sm text-muted-foreground hover:text-foreground transition"
									>
										{contactEmail}
									</a>
								</li>
							)}
							{phone && (
								<li>
									<a
										href={`tel:${phone.replace(/\s+/g, "")}`}
										className="text-sm text-muted-foreground hover:text-foreground transition"
									>
										{phone}
									</a>
								</li>
							)}
						</ul>
					</div>
				</div>

				<div className="border-t border-foreground/10 py-8 space-y-3 text-xs text-muted-foreground">
					{addressOneLine && (
						<div className="text-foreground/85">{addressOneLine}</div>
					)}
					<p className="leading-relaxed">
						© {year} The Assembly Rooms Newark Limited. All rights reserved.
						Company number <span className="font-mono">17222980</span>,
						registered in England &amp; Wales. Wholly owned and operated
						by{" "}
						<a
							href="https://www.assemblechurch.com"
							target="_blank"
							rel="noopener noreferrer"
							className="whitespace-nowrap underline underline-offset-2 hover:text-foreground"
						>
							Assemble Church
						</a>
						.
					</p>
				</div>
			</Container>
		</footer>
	);
}
