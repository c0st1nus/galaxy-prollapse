import {migrate} from "drizzle-orm/postgres-js/migrator";
import {db} from "./index";
import fs from "fs";
import path from "path";
import {config} from "../utils/config";

function resolveMigrationsFolder() {
  const candidates = [
    config.MIGRATIONS_DIR || "",
    path.resolve(process.cwd(), "drizzle"),
    path.resolve(import.meta.dir, "../../drizzle"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate drizzle migrations directory. Checked: ${candidates.join(", ")}`,
  );
}

export async function runMigrations() {
  const migrationsFolder = resolveMigrationsFolder();
  console.log("Running migrations...");
  try {
    await migrate(db, {migrationsFolder});
    console.log("Migrations applied successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}
