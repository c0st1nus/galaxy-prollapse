export const config = {
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "supersecret",
  PORT: process.env.PORT || "3000",
};

if (!config.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment variables");
}
