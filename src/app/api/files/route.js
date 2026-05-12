import { Buffer } from "node:buffer";
import { requireAuth, json } from "@/utils/auth/auth-guard.js";
import { uploadFile, getFileRecord, FILE_TYPES } from "@/utils/files/files.server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
    const gate = await requireAuth(request);
    if (!gate.ok) return gate.response;

    const formData = await request.formData();
    const upload = formData.get("file");
    const fileType = formData.get("file_type");

    if (!upload || typeof upload === "string") {
        return json(400, { error: "file is required" });
    }
    if (typeof fileType !== "string" || !FILE_TYPES.has(fileType)) {
        return json(400, { error: "valid file_type is required" });
    }

    const buffer = Buffer.from(await upload.arrayBuffer());

    try {
        const record = await uploadFile(buffer, {
            originalName: upload.name || "upload",
            mimeType: upload.type || "application/octet-stream",
            fileType,
            uploadedBy: gate.user?.id ?? null,
        });
        return json(201, record);
    } catch (err) {
        return json(500, { error: err?.message || "Upload failed" });
    }
}

export async function GET(request) {
    const gate = await requireAuth(request);
    if (!gate.ok) return gate.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return json(400, { error: "id is required" });

    const record = await getFileRecord(id);
    if (!record || record.deletedAt) return json(404, { error: "Not found" });

    return json(200, record);
}
