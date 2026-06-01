import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
	/* config options here */
	reactCompiler: true,
	allowedDevOrigins: ['http://localhost:3000'],
	typescript: {
		ignoreBuildErrors: true,
	},
	experimental: {
		// 30s on dynamic routes. The old 180s value was caching booking /
		// payment status pages long enough that customers saw stale
		// "awaiting payment" UI for minutes after Stripe webhook flipped
		// the row. Server actions still call `router.refresh()` after
		// mutations, but this is the safety net for fresh navigations.
		staleTimes: {
			dynamic: 30,
		},
	},
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: 'cdn.assembly-rooms.com' },
			{ protocol: 'https', hostname: '*.s3.amazonaws.com' },
			{ protocol: 'https', hostname: '*.s3.*.amazonaws.com' },
		],
		localPatterns: [
			{ pathname: '/**', search: '' },
		],
		qualities: [50, 75, 90, 100],
	},
};

// Wrap the config so the Sentry webpack plugin can upload source maps
// when SENTRY_AUTH_TOKEN is present. Local dev skips the upload cleanly.
export default withSentryConfig(nextConfig, {
	org: "webworks-ix",
	project: "javascript-nextjs",
	silent: !process.env.CI,
	widenClientFileUpload: true,
	disableLogger: true,
	automaticVercelMonitors: false,
});
