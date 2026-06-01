/**
 * Next.js instrumentation hook. Runs once on cold start of the server
 * process and per edge worker boot. We forward to the relevant Sentry
 * config so error capture is wired before any route handlers run.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("./sentry.server.config");
	}
	if (process.env.NEXT_RUNTIME === "edge") {
		await import("./sentry.edge.config");
	}
}

// Forward request errors that escape route handlers to Sentry. Without
// this hook, RSC / route-handler exceptions only surface in the Next.js
// dev overlay, not the dashboard.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
