"use client";

import { useEffect } from "react";
import { Container } from "@/site/ui/container";
import { Hero } from "@/site/ui/hero";

export default function AuthVerifiedPage() {
	// If the user is mid-booking in another tab, that tab is polling for the
	// session and will pick up automatically. This page is the landing target
	// for the magic-link click and just needs to confirm and (politely) get
	// out of the way.
	useEffect(() => {
		document.title = "Signed in — The Assembly Rooms";
	}, []);

	function tryClose() {
		try {
			window.close();
		} catch {}
	}

	return (
		<>
			<Hero
				height="short"
				kicker="Signed in"
				title="You're signed in."
				subtitle="Pop back to the booking window in your other tab — it'll pick up automatically."
			/>
			<Container className="pt-4 pb-12 lg:pb-16">
				<div className="max-w-md mx-auto text-center space-y-4">
					<p className="text-sm text-muted-foreground">
						Nothing more to do here. If you opened this from your email on a
						different device, just keep the original booking window open.
					</p>
					<button
						type="button"
						onClick={tryClose}
						className="text-xs text-muted-foreground hover:text-foreground underline"
					>
						Close this tab
					</button>
				</div>
			</Container>
		</>
	);
}
