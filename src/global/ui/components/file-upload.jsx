"use client";

import { useRef, useState } from "react";
import { Button } from "@/shadcn/components/ui/button";
import LoadingSpinner from "@/global/ui/components/loading-spinner";
import { uploadFileFromBrowser } from "@/utils/files/files.client";

export default function FileUpload({
    fileType,
    onUploaded,
    onError,
    accept,
    label = "Choose file",
    className = "",
    disabled = false,
}) {
    const inputRef = useRef(null);
    const [progress, setProgress] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);

    async function handleFile(file) {
        if (!file) return;
        setError(null);
        setUploading(true);
        setProgress(0);
        try {
            const record = await uploadFileFromBrowser(file, fileType, setProgress);
            setProgress(1);
            onUploaded?.(record);
        } catch (err) {
            const message = err?.message || "Upload failed";
            setError(message);
            onError?.(err);
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    }

    return (
        <div className={className}>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                hidden
                disabled={disabled || uploading}
                onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button
                type="button"
                variant="outline"
                disabled={disabled || uploading}
                onClick={() => inputRef.current?.click()}
            >
                {uploading ? <LoadingSpinner small /> : label}
            </Button>
            {uploading && progress != null && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded bg-muted">
                    <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                </div>
            )}
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
    );
}
