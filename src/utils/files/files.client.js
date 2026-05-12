"use client";

export function uploadFileFromBrowser(file, fileType, onProgress) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("file_type", fileType);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/files");
        xhr.responseType = "json";
        xhr.withCredentials = true;

        if (typeof onProgress === "function" && xhr.upload) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) onProgress(e.loaded / e.total);
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else {
                const message = xhr.response?.error || `Upload failed (${xhr.status})`;
                reject(new Error(message));
            }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(formData);
    });
}

export async function fetchFileRecord(fileId) {
    const res = await fetch(`/api/files?id=${encodeURIComponent(fileId)}`, { credentials: "include" });
    if (!res.ok) return null;
    return res.json();
}
