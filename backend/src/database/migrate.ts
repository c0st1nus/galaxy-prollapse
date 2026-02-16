import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./index";
import path from "path";

export async function runMigrations() {
  console.log("Running migrations...");
  try {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("Migrations applied successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}
