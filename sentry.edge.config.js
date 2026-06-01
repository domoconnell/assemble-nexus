// Edge-runtime Sentry init. Picked up by `instrumentation.js` when a
// route runs under `export const runtime = "edge"`. The current app is
// all `nodejs`-runtime so this is mostly future-proofing, but the
// withSentryConfig wrapper expects the file to exist.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
	dsn: process.env.SENTRY_DSN,
	environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
	tracesSampleRate: 0.1,
});
