/**
 * Smoke tests for the cron endpoints. Hits each one against a running
 * dev/prod server with the CRON_SECRET header, checks for HTTP 200 +
 * non-empty JSON. Doesn't validate semantic outcomes - that's the unit
 * tests' job. This is just "does the wiring still work".
 *
 * Run with the dev server up:
 *   node --env-file=.env tests/smoke/run.mjs
 *
 * To target production:
 *   TEST_SERVER_URL=https://www.assembly-rooms.com node --env-file=.env tests/smoke/run.mjs
 */

const SERVER = (process.env.TEST_SERVER_URL || "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
	console.error("✗ CRON_SECRET not set");
	process.exit(1);
}

const results = [];

async function probe(label, path, { method = "POST" } = {}) {
	const url = `${SERVER}${path}`;
	const t0 = Date.now();
	try {
		const res = await fetch(url, {
			method,
			headers: { "X-Cron-Secret": SECRET },
		});
		const dur = Date.now() - t0;
		let body = null;
		const contentType = res.headers.get("content-type") || "";
		if (contentType.includes("application/json")) {
			body = await res.json();
		} else {
			body = await res.text();
		}
		const ok = res.ok && (body && (typeof body === "object" || body.length > 0));
		results.push({ label, ok, status: res.status, ms: dur });
		console.log(`${ok ? "✓" : "✗"} ${label} · ${res.status} · ${dur}ms`);
		if (!ok) {
			console.error(`  body:`, body);
		}
	} catch (err) {
		results.push({ label, ok: false, error: err?.message || String(err) });
		console.error(`✗ ${label} · ${err?.message || err}`);
	}
}

console.log(`Probing ${SERVER}\n`);

await probe("bank-sync", "/crons/bank-sync");
await probe("square-sync", "/crons/square-sync");
await probe("daily-tasks", "/crons/daily-tasks");
await probe(
	"monthly-report (last month, dry preview to dom@webworks.marketing)",
	`/crons/monthly-report?force=1&to=${encodeURIComponent("dom@webworks.marketing")}`,
);

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
