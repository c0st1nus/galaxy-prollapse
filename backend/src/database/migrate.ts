import {migrate} from "drizzle-orm/postgres-js/migrator";
import {db} from "./index";
import path from "path";

// resolve drizzle folder relative to this file so it works regardless of cwd
const migrationsFolder = path.resolve(import.meta.dir, "../../drizzle");

export async function runMigrations() {
  console.log("Running migrations...");
  try {
    await migrate(db, {migrationsFolder});
    console.log("Migrations applied successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}
