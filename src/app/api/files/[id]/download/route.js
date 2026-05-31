import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth, json } from "@/utils/auth/auth-guard.js";
import { getFileRecord } from "@/utils/files/files.server.js";
import { getS3Client, getBucket } from "@/utils/files/s3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stream a stored file's bytes to the authenticated caller. Used for
 * non-public files (e.g. signed tenancy agreements) where we can't hand
 * out a public S3 URL.
 *
 * Public files just redirect to their `public_url` so we don't waste
 * server bandwidth proxying them.
 *
 * Auth: any authenticated user can fetch by id. The id is a UUID so it
 * isn't enumerable; row-level visibility is enforced by the caller (the
 * UI only renders the link for users who can see the agreement).
 */
export async function GET(request, { params }) {
	const gate = await requireAuth(request);
	if (!gate.ok) return gate.response;

	const { id } = await params;
	const record = await getFileRecord(id);
	if (!record || record.deletedAt) {
		return json(404, { error: "Not found" });
	}

	if (record.is_public && record.public_url) {
		return Response.redirect(record.public_url, 302);
	}

	const get = await getS3Client().send(
		new GetObjectCommand({ Bucket: getBucket(), Key: record.s3_key }),
	);
	if (!get.Body) return json(404, { error: "Empty body" });

	const disposition = request.nextUrl?.searchParams?.get("inline") === "1" ? "inline" : "attachment";
	const safeName = (record.original_name || "download").replace(/[^a-zA-Z0-9._-]+/g, "-");

	return new Response(get.Body, {
		status: 200,
		headers: {
			"Content-Type": record.mime_type || "application/octet-stream",
			"Content-Disposition": `${disposition}; filename="${safeName}"`,
			...(record.size_bytes ? { "Content-Length": String(record.size_bytes) } : {}),
		},
	});
}
