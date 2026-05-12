import { S3Client } from "@aws-sdk/client-s3";

let _client = null;

export function getS3Client() {
    if (_client) return _client;

    const region = process.env.AWS_REGION;
    if (!region) throw new Error("AWS_REGION is not set");

    _client = new S3Client({
        region,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });

    return _client;
}

export function getBucket() {
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) throw new Error("AWS_S3_BUCKET is not set");
    return bucket;
}

export function buildPublicUrl(s3Key) {
    const base = process.env.AWS_S3_PUBLIC_URL_BASE;
    if (base) {
        return `${base.replace(/\/$/, "")}/${s3Key}`;
    }
    const region = process.env.AWS_REGION;
    return `https://${getBucket()}.s3.${region}.amazonaws.com/${s3Key}`;
}
