export const config = {
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "supersecret",
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || "3000",
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || "localhost",
  MINIO_PORT: process.env.MINIO_PORT || "9000",
  MINIO_USE_SSL: process.env.MINIO_USE_SSL || "false",
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || "minioadmin",
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || "minioadmin",
  MINIO_BUCKET: process.env.MINIO_BUCKET || "school-hackathon",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL_PRIMARY: process.env.OPENAI_MODEL_PRIMARY || "gpt-5-nano",
  OPENAI_MODEL_ESCALATION: process.env.OPENAI_MODEL_ESCALATION || "gpt-5-mini",
  OPENAI_MODEL_MANUAL_OVERRIDE: process.env.OPENAI_MODEL_MANUAL_OVERRIDE || "gpt-5.2",
  OPENAI_MIN_CONFIDENCE: Number(process.env.OPENAI_MIN_CONFIDENCE || "0.65"),
  OPENAI_TIMEOUT_MS: Number(process.env.OPENAI_TIMEOUT_MS || "15000"),
  MIGRATIONS_DIR: process.env.MIGRATIONS_DIR || "",
};

if (!config.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment variables");
}

if (Number.isNaN(config.OPENAI_MIN_CONFIDENCE) || config.OPENAI_MIN_CONFIDENCE < 0 || config.OPENAI_MIN_CONFIDENCE > 1) {
  throw new Error("OPENAI_MIN_CONFIDENCE must be a number between 0 and 1");
}

if (Number.isNaN(config.OPENAI_TIMEOUT_MS) || config.OPENAI_TIMEOUT_MS <= 0) {
  throw new Error("OPENAI_TIMEOUT_MS must be a positive number");
}

if (config.NODE_ENV === "production" && config.JWT_SECRET === "supersecret") {
  throw new Error("JWT_SECRET must be changed from default in production");
}
