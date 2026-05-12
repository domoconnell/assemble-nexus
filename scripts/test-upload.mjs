import { createHash, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { db, client } from "../src/db/index.js";
import { file } from "../src/db/schema/entities/file.js";
import { getS3Client, getBucket, buildPublicUrl } from "../src/utils/files/s3.js";

async function main() {
    const content = `assemble-nexus test upload @ ${new Date().toISOString()} nonce=${randomBytes(8).toString("hex")}`;
    const buffer = Buffer.from(content, "utf8");
    const hashHex = createHash("sha256").update(buffer).digest("hex");
    const s3Key = `general/test/${hashHex}.txt`;
    const bucket = getBucket();

    console.log(`→ Uploading ${buffer.length}B to s3://${bucket}/${s3Key}`);
    await getS3Client().send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: buffer,
            ContentType: "text/plain",
            ContentLength: buffer.length,
        }),
    );

    const publicUrl = buildPublicUrl(s3Key);
    console.log(`→ Public URL: ${publicUrl}`);

    const [record] = await db
        .insert(file)
        .values({
            original_name: "test-upload.txt",
            mime_type: "text/plain",
            size_bytes: buffer.length,
            s3_key: s3Key,
            public_url: publicUrl,
            file_type: "general",
            is_public: true,
        })
        .returning();
    console.log(`→ DB record id: ${record.id}`);

    console.log("→ Fetching public URL…");
    const res = await fetch(publicUrl);
    const body = await res.text();
    const ok = res.ok && body === content;

    console.log(`   status:        ${res.status} ${res.statusText}`);
    console.log(`   content-type:  ${res.headers.get("content-type")}`);
    console.log(`   body matches:  ${body === content}`);

    console.log("→ Cleaning up S3 object + DB row…");
    await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));
    await db.delete(file).where(eq(file.id, record.id));

    if (ok) {
        console.log("\n✓ Upload + public access verified");
    } else {
        console.error("\n✗ Verification failed");
        process.exitCode = 1;
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await client.end({ timeout: 5 });
    });
