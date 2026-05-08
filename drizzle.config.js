import fs from "node:fs";
import path from "node:path";

const ca = fs.readFileSync(path.resolve(process.cwd(), "certs", "ca.crt"), "utf8");

export default {
	schema: "./src/db/schema/index.js",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		host: process.env.POSTGRES_HOST,
		port: Number(process.env.POSTGRES_PORT || 5432),
		user: process.env.POSTGRES_USER,
		password: process.env.POSTGRES_PASSWORD,
		database: process.env.POSTGRES_DB,

		ssl: {
			ca,
			rejectUnauthorized: true,
		},
		options: "--search_path=public",
	},
};