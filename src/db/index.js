import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const {
  POSTGRES_HOST,
  POSTGRES_PORT,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
  POSTGRES_DB,
} = process.env;

for (const [k, v] of Object.entries({
  POSTGRES_HOST,
  POSTGRES_PORT,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
  POSTGRES_DB,
})) {
  if (!v) throw new Error(`${k} is not set`);
}

function createClient() {
  const ca = fs.readFileSync(path.resolve(process.cwd(), "certs", "ca.crt"), "utf8");

  return postgres({
    host: POSTGRES_HOST,
    port: Number(POSTGRES_PORT),
    username: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    database: POSTGRES_DB,
    ssl: { ca, rejectUnauthorized: true },
    max: 1,
    idle_timeout: 20,
    max_lifetime: 60 * 5,
  });
}

const client = globalThis.__pgClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__pgClient = client;
}

await client`set search_path to public`;

export const db = drizzle(client);
export { client };