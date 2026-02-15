import {migrate} from "drizzle-orm/postgres-js/migrator";
import {db} from "./index";
import fs from "fs";
import path from "path";

function resolveMigrationsFolder() {
  const candidates = [
    // common root execution (cwd = repo root)
    path.resolve(process.cwd(), "backend/drizzle"),
    // common backend execution (cwd = backend)
    path.resolve(process.cwd(), "drizzle"),
    // source runtime
    path.resolve(import.meta.dir, "../../drizzle"),
    // bundled runtime fallback
    path.resolve(import.meta.dir, "../../../drizzle"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.resolve(candidate, "meta/_journal.json"))) {
      return candidate;
    }
  }

  // keep first candidate as deterministic fallback for error messages downstream.
  return candidates[0];
}

const migrationsFolder = resolveMigrationsFolder();

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
