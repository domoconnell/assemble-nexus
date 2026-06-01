// Client-side Sentry init. Loaded automatically by @sentry/nextjs's
// webpack plugin on every page bundle.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
	environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
	// Performance traces: lower than the default 1.0 to keep the
	// project on the free tier; bump if you start needing visibility
	// into slow client routes.
	tracesSampleRate: 0.1,
	// Session replay disabled - opt-in later if needed.
	replaysSessionSampleRate: 0,
	replaysOnErrorSampleRate: 0,
});
