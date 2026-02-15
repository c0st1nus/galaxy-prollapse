import * as Minio from "minio";
import { config } from "../utils/config";
import { nanoid } from "nanoid";

const minioClient = new Minio.Client({
    endPoint: config.MINIO_ENDPOINT,
    port: parseInt(config.MINIO_PORT),
    useSSL: config.MINIO_USE_SSL === 'true',
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY
});

const BUCKET_NAME = config.MINIO_BUCKET;

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

    // Return a URL. 
    // If MinIO is public, we can construct the URL directly.
    // Or we can use presigned URLs. 
    // For simplicity, assuming public read access or simple URL construction for now.
    // Constructing public URL based on endpoint/bucket/filename
    
    const protocol = config.MINIO_USE_SSL === 'true' ? 'https' : 'http';
    const port = config.MINIO_PORT ? `:${config.MINIO_PORT}` : '';
    // If endpoint is localhost, we need to be careful about what the client can reach.
    // Usually invalid in production to return localhost/minio to frontend.
    // But for hackathon/dev it's fine.
    
    return `${protocol}://${config.MINIO_ENDPOINT}${port}/${BUCKET_NAME}/${filename}`;
}
