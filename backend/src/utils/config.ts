export const config = {
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "supersecret",
  PORT: process.env.PORT || "3000",
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || "localhost",
  MINIO_PORT: process.env.MINIO_PORT || "9000",
  MINIO_USE_SSL: process.env.MINIO_USE_SSL || "false",
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || "minioadmin",
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || "minioadmin",
  MINIO_BUCKET: process.env.MINIO_BUCKET || "school-hackathon",
};

if (!config.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment variables");
}
