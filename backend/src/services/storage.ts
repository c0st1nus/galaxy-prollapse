import * as Minio from "minio";
import { config } from "../utils/config";
import { nanoid } from "nanoid";

const minioClient = new Minio.Client({
    endPoint: config.MINIO_ENDPOINT,
    port: config.MINIO_PORT,
    useSSL: config.MINIO_USE_SSL,
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY
});

const BUCKET_NAME = config.MINIO_BUCKET;

function knownStorageHosts() {
    const hosts = new Set<string>();
    const endpoint = config.MINIO_ENDPOINT.trim().toLowerCase();
    if (endpoint) {
        hosts.add(endpoint);
        if (!endpoint.includes(":")) {
            hosts.add(`${endpoint}:${config.MINIO_PORT}`);
        }
    }
    if (config.MINIO_PUBLIC_BASE_URL) {
        try {
            const parsed = new URL(config.MINIO_PUBLIC_BASE_URL);
            hosts.add(parsed.host.trim().toLowerCase());
            hosts.add(parsed.hostname.trim().toLowerCase());
        } catch {
            // ignore invalid MINIO_PUBLIC_BASE_URL and rely on endpoint host.
        }
    }
    return hosts;
}

function parseStorageObjectFromUrl(fileUrl: string): { bucket: string; objectName: string } | null {
    let parsed: URL;
    try {
        parsed = new URL(fileUrl);
    } catch {
        return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
    }

    const host = parsed.host.trim().toLowerCase();
    const hostname = parsed.hostname.trim().toLowerCase();
    const knownHosts = knownStorageHosts();
    if (!knownHosts.has(host) && !knownHosts.has(hostname)) {
        return null;
    }

    const rawSegments = parsed.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (rawSegments.length < 2) {
        return null;
    }

    const bucket = decodeURIComponent(rawSegments[0]);
    const objectName = rawSegments
        .slice(1)
        .map((part) => decodeURIComponent(part))
        .join("/");

    if (!bucket || !objectName) {
        return null;
    }
    return { bucket, objectName };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
        if (typeof chunk === "string") {
            chunks.push(Buffer.from(chunk));
            continue;
        }
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

function publicStorageBaseUrl() {
    if (config.MINIO_PUBLIC_BASE_URL) return config.MINIO_PUBLIC_BASE_URL;
    const protocol = config.MINIO_USE_SSL ? "https" : "http";
    const defaultPort = config.MINIO_USE_SSL ? 443 : 80;
    const port = config.MINIO_PORT === defaultPort ? "" : `:${config.MINIO_PORT}`;
    return `${protocol}://${config.MINIO_ENDPOINT}${port}`;
}

// Ensure bucket exists on startup
(async () => {
    try {
        const exists = await minioClient.bucketExists(BUCKET_NAME);
        if (!exists) {
            await minioClient.makeBucket(BUCKET_NAME, 'us-east-1'); // Region is required but often ignored by MinIO
            console.log(`Bucket ${BUCKET_NAME} created successfully`);
        }
    } catch (err) {
        console.error("Error ensuring bucket exists:", err);
    }
})();

export async function uploadFile(file: File): Promise<string> {
    const extension = file.name.split('.').pop();
    const filename = `${nanoid()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    
    await minioClient.putObject(BUCKET_NAME, filename, buffer, file.size, {
        'Content-Type': file.type
    });

    return `${publicStorageBaseUrl()}/${BUCKET_NAME}/${filename}`;
}

export async function readStorageUrl(
    fileUrl: string,
): Promise<{ bytes: Buffer; contentType: string | null } | null> {
    const parsed = parseStorageObjectFromUrl(fileUrl);
    if (!parsed) return null;

    const metadata = await minioClient.statObject(parsed.bucket, parsed.objectName);
    const stream = await minioClient.getObject(parsed.bucket, parsed.objectName);
    const bytes = await streamToBuffer(stream);
    const contentType = (metadata?.metaData?.["content-type"] || "").trim() || null;

    return { bytes, contentType };
}
