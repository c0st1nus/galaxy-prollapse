const MAX_PHOTO_SIZE_BYTES = 12 * 1024 * 1024;

const ALLOWED_PHOTO_MIME_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
]);

function normalizeMime(mime: string | null | undefined): string {
    return (mime || "").trim().toLowerCase();
}

function mimeExtension(mime: string): string {
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    if (mime === "image/heic") return "heic";
    if (mime === "image/heif") return "heif";
    return "jpg";
}

function normalizeDataUrlPayload(payload: string): string {
    return payload.replace(/\s+/g, "");
}

export function validatePhotoFile(file: File, fieldName = "photo"): void {
    const mime = normalizeMime(file.type);
    if (!mime || !mime.startsWith("image/")) {
        throw new Error(`${fieldName} must be an image file`);
    }
    if (!ALLOWED_PHOTO_MIME_TYPES.has(mime)) {
        throw new Error(
            `${fieldName} has unsupported type "${mime}". Allowed: jpeg, png, webp, heic, heif`,
        );
    }
    if (!Number.isFinite(file.size) || file.size <= 0) {
        throw new Error(`${fieldName} is empty`);
    }
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
        throw new Error(`${fieldName} exceeds ${Math.floor(MAX_PHOTO_SIZE_BYTES / (1024 * 1024))}MB`);
    }
}

export function imageDataUrlToFile(dataUrl: string, fallbackBaseName: string): File {
    const trimmed = dataUrl.trim();
    const match = /^data:([^;]+);base64,(.+)$/i.exec(trimmed);
    if (!match) {
        throw new Error("photo_data_url must be a base64 data URL");
    }

    const mime = normalizeMime(match[1]);
    if (!mime.startsWith("image/")) {
        throw new Error("photo_data_url must contain an image");
    }
    if (!ALLOWED_PHOTO_MIME_TYPES.has(mime)) {
        throw new Error(
            `photo_data_url has unsupported type "${mime}". Allowed: jpeg, png, webp, heic, heif`,
        );
    }

    let bytes: Buffer;
    try {
        bytes = Buffer.from(normalizeDataUrlPayload(match[2]), "base64");
    } catch {
        throw new Error("photo_data_url is not valid base64");
    }

    if (!bytes.length) {
        throw new Error("photo_data_url decoded to an empty file");
    }

    const filename = `${fallbackBaseName}.${mimeExtension(mime)}`;
    const binary = Uint8Array.from(bytes);
    const file = new File([binary], filename, {type: mime});
    validatePhotoFile(file, "photo_data_url");
    return file;
}
