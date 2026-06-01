"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * React error boundary that catches everything the per-route `error.js`
 * pages don't. Forwards the error to Sentry then renders the bare
 * fallback (we deliberately keep the markup minimal because the layout
 * may itself have crashed).
 */
export default function GlobalError({ error }) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return (
		<html>
			<body
				style={{
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
					margin: 0,
					padding: "48px 24px",
					background: "#0f172a",
					color: "#f1f5f9",
					minHeight: "100vh",
				}}
			>
				<div style={{ maxWidth: 540, margin: "0 auto" }}>
					<h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 12px" }}>
						Something went wrong
					</h1>
					<p style={{ color: "#94a3b8", lineHeight: 1.55 }}>
						Sorry - this page hit an unexpected error. We&apos;ve been
						notified and will get it sorted. Refresh to try again.
					</p>
				</div>
			</body>
		</html>
	);
}
