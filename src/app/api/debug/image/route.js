import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint for the prod image-optimizer 400 issue. Remove once
 * the underlying cause is found. Hit /api/debug/image to see whether the
 * public folder is where Next expects it and whether the source PNG is
 * actually shipping in the deploy.
 */
export async function GET(req) {
	const cwd = process.cwd();
	const publicDir = path.join(cwd, "public");

	let publicDirFiles = null;
	let publicDirError = null;
	try {
		publicDirFiles = await fs.readdir(publicDir);
	} catch (err) {
		publicDirError = err?.message || String(err);
	}

	let imageInfo = null;
	try {
		const imagePath = path.join(publicDir, "assembly-rooms-white.png");
		const stat = await fs.stat(imagePath);
		const fd = await fs.open(imagePath, "r");
		const head = Buffer.alloc(16);
		await fd.read(head, 0, 16, 0);
		await fd.close();
		imageInfo = {
			absolutePath: imagePath,
			exists: true,
			size: stat.size,
			firstBytesHex: head.toString("hex"),
			looksLikePng: head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47,
		};
	} catch (err) {
		imageInfo = { exists: false, error: err?.message || String(err) };
	}

	let internalFetch = null;
	try {
		const origin = new URL(req.url).origin;
		const target = `${origin}/assembly-rooms-white.png`;
		const res = await fetch(target, { redirect: "manual" });
		const buf = Buffer.from(await res.arrayBuffer());
		internalFetch = {
			target,
			status: res.status,
			location: res.headers.get("location"),
			contentType: res.headers.get("content-type"),
			contentLength: res.headers.get("content-length"),
			bodyByteLength: buf.length,
			firstBytesHex: buf.slice(0, 16).toString("hex"),
		};
	} catch (err) {
		internalFetch = { error: err?.message || String(err) };
	}

	return Response.json({
		now: new Date().toISOString(),
		cwd,
		publicDir,
		publicDirFiles,
		publicDirError,
		imageInfo,
		internalFetch,
		env: {
			BASE_URL: process.env.BASE_URL || null,
			NODE_ENV: process.env.NODE_ENV || null,
		},
		reqHeaders: {
			host: req.headers.get("host"),
			xForwardedProto: req.headers.get("x-forwarded-proto"),
			xForwardedHost: req.headers.get("x-forwarded-host"),
		},
	});
}
