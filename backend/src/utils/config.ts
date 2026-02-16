function env(name: string, fallback = ""): string {
  const value = process.env[name];
  return typeof value === "string" ? value : fallback;
}

function requiredEnv(name: string): string {
  const value = env(name).trim();
  if (!value) {
    throw new Error(`${name} is not set in environment variables`);
  }
  return value;
}

function integerEnv(name: string, fallback: number): number {
  const raw = env(name, String(fallback)).trim();
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = env(name, fallback ? "true" : "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

const NODE_ENV = env("NODE_ENV", "development").trim().toLowerCase();
const JWT_SECRET = env("JWT_SECRET", "supersecret").trim();

if (NODE_ENV === "production") {
  const insecureSecrets = new Set([
    "supersecret",
    "change-me-to-a-strong-random-string",
    "changeme",
  ]);
  if (!JWT_SECRET || insecureSecrets.has(JWT_SECRET) || JWT_SECRET.length < 24) {
    throw new Error(
      "JWT_SECRET must be set to a strong value (at least 24 chars) in production",
    );
  }
}

export const config = {
  NODE_ENV,
  DATABASE_URL: requiredEnv("DATABASE_URL"),
  JWT_SECRET,
  PORT: integerEnv("PORT", 3000),
  MINIO_ENDPOINT: env("MINIO_ENDPOINT", "localhost").trim(),
  MINIO_PORT: integerEnv("MINIO_PORT", 9000),
  MINIO_USE_SSL: booleanEnv("MINIO_USE_SSL", false),
  MINIO_ACCESS_KEY: env("MINIO_ACCESS_KEY", "minioadmin").trim(),
  MINIO_SECRET_KEY: env("MINIO_SECRET_KEY", "minioadmin").trim(),
  MINIO_BUCKET: env("MINIO_BUCKET", "school-hackathon").trim(),
  MINIO_PUBLIC_BASE_URL: env("MINIO_PUBLIC_BASE_URL", "").trim().replace(/\/+$/, ""),
  OPENAI_API_KEY: env("OPENAI_API_KEY", "").trim(),
  AI_REVIEW_MODEL: env("AI_REVIEW_MODEL", "gpt-5-mini").trim(),
};
