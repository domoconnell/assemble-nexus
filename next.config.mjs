/** @type {import('next').NextConfig} */
const nextConfig = {
	/* config options here */
	reactCompiler: true,
	allowedDevOrigins: ['http://localhost:3000'],
	typescript: {
		ignoreBuildErrors: true,
	},
	experimental: {
		staleTimes: {
			dynamic: 180,
		},
	},
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: 'cdn.assembly-rooms.com' },
			{ protocol: 'https', hostname: '*.s3.amazonaws.com' },
			{ protocol: 'https', hostname: '*.s3.*.amazonaws.com' },
		],
	},
};

export default nextConfig;
