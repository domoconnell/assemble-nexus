import { createHash } from "node:crypto";
import path from "node:path";
import { Buffer } from "node:buffer";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { file } from "@/db/schema/entities/file.js";
import { getS3Client, getBucket, buildPublicUrl } from "@/utils/files/s3.js";

export const FILE_TYPES = new Set([
    "user-avatar",
    "venue-logo",
    "room-hero",
    "room-gallery",
    "room-floorplan",
    "event-hero",
    "event-gallery",
    "invoice-pdf",
    "ticket-qr",
    "tenancy-agreement",
    "general",
]);

function pad(n) { return String(n).padStart(2, "0"); }

function buildKey(fileType, originalName, hashHex) {
    const ext = (path.extname(originalName) || "").toLowerCase();
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = pad(now.getUTCMonth() + 1);
    const dd = pad(now.getUTCDate());
    return `${fileType}/${yyyy}/${mm}/${dd}/${hashHex}${ext}`;
}

function hashBuffer(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

async function readBody(body) {
    const chunks = [];
    for await (const chunk of body) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    return Buffer.concat(chunks);
}

export async function uploadFile(buffer, { originalName, mimeType, fileType, uploadedBy = null, isPublic = true }) {
    if (!buffer || !buffer.length) throw new Error("Empty buffer");
    if (!FILE_TYPES.has(fileType)) throw new Error(`Invalid file_type: ${fileType}`);
    if (!originalName) throw new Error("originalName is required");
    if (!mimeType) throw new Error("mimeType is required");

    const hashHex = hashBuffer(buffer);
    const s3Key = buildKey(fileType, originalName, hashHex);
    const bucket = getBucket();

    await getS3Client().send(new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
    }));

    const publicUrl = isPublic ? buildPublicUrl(s3Key) : null;

    const [record] = await db
        .insert(file)
        .values({
            original_name: originalName,
            mime_type: mimeType,
            size_bytes: buffer.length,
            s3_key: s3Key,
            public_url: publicUrl,
            file_type: fileType,
            is_public: isPublic,
            uploaded_by_user_id: uploadedBy,
        })
        .returning();

    return record;
}

export async function uploadFileFromUrl(sourceUrl, { fileType, originalName, mimeType, uploadedBy = null, isPublic = true }) {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const finalMime = mimeType || res.headers.get("content-type") || "application/octet-stream";
    const finalName = originalName || path.basename(new URL(sourceUrl).pathname) || "download";
    return uploadFile(buffer, { originalName: finalName, mimeType: finalMime, fileType, uploadedBy, isPublic });
}

export async function getFileRecord(fileId) {
    if (!fileId) return null;
    const [r] = await db.select().from(file).where(eq(file.id, fileId)).limit(1);
    return r ?? null;
}

export async function deleteFile(fileId) {
    const r = await getFileRecord(fileId);
    if (!r || r.deletedAt) return;
    await db.update(file).set({ deletedAt: new Date() }).where(eq(file.id, fileId));
}

export async function resolveFileUrl(fileId) {
    const r = await getFileRecord(fileId);
    if (!r || r.deletedAt) return null;
    return r.public_url;
}

export async function moveS3File(sourceS3Key, { fileType, originalName, mimeType, uploadedBy = null, isPublic = true }) {
    if (!FILE_TYPES.has(fileType)) throw new Error(`Invalid file_type: ${fileType}`);
    const bucket = getBucket();
    const get = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: sourceS3Key }));
    const buffer = await readBody(get.Body);
    const finalMime = mimeType || get.ContentType || "application/octet-stream";
    const finalName = originalName || path.basename(sourceS3Key);
    const record = await uploadFile(buffer, { originalName: finalName, mimeType: finalMime, fileType, uploadedBy, isPublic });
    await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: sourceS3Key }));
    return record;
}
