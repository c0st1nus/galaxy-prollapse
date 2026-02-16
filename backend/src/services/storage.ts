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
