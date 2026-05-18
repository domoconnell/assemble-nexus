import { PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client, getBucket, buildPublicUrl } from "@/utils/files/s3.js";

/**
 * S3 key for a venue's board pack for a given month. Slug is sanitised
 * so it's safe in URLs / S3 paths.
 */
export function boardPackS3Key(venueSlug, ym) {
	const slug = String(venueSlug || "venue").replace(/[^a-zA-Z0-9_-]+/g, "-");
	return `board-packs/${slug}/${ym}.pdf`;
}

/**
 * Upload a built board-pack PDF Buffer to S3. Overwrites any existing
 * object at the same key so re-runs replace the file in place. Returns
 * the S3 key + public URL.
 */
export async function uploadBoardPackToS3(buffer, venueSlug, ym) {
	const key = boardPackS3Key(venueSlug, ym);
	await getS3Client().send(
		new PutObjectCommand({
			Bucket: getBucket(),
			Key: key,
			Body: buffer,
			ContentType: "application/pdf",
			ContentDisposition: `attachment; filename="board-pack-${venueSlug}-${ym}.pdf"`,
		}),
	);
	return { key, url: buildPublicUrl(key) };
}

/**
 * HEAD the object to see whether the report has already been uploaded.
 * Cheap idempotency check the cron can use before regenerating.
 */
export async function boardPackExistsOnS3(venueSlug, ym) {
	const key = boardPackS3Key(venueSlug, ym);
	try {
		await getS3Client().send(
			new HeadObjectCommand({ Bucket: getBucket(), Key: key }),
		);
		return true;
	} catch (err) {
		if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") {
			return false;
		}
		throw err;
	}
}
