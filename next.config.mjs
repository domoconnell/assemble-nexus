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
};

export default nextConfig;
