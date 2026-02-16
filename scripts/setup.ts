/**
 * Platform-agnostic first-time setup script.
 * Copies .env.example → .env where missing and installs dependencies.
 *
 * Usage:  bun run setup          (from project root)
 */
import { existsSync, copyFileSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..");

const envPairs: [string, string][] = [
  [".env.example", ".env"],
  ["backend/.env.example", "backend/.env"],
];

console.log("── Setting up environment files ──");
for (const [src, dest] of envPairs) {
  const srcPath = resolve(root, src);
  const destPath = resolve(root, dest);
  if (existsSync(destPath)) {
    console.log(`  ✓ ${dest} already exists — skipped`);
  } else if (!existsSync(srcPath)) {
    console.log(`  ✗ ${src} not found — skipped`);
  } else {
    copyFileSync(srcPath, destPath);
    console.log(`  ✓ ${dest} created from ${src}`);
  }
}

console.log("\n── Installing dependencies ──");
const proc = Bun.spawnSync(["bun", "install"], { cwd: root, stdio: ["inherit", "inherit", "inherit"] });
if (proc.exitCode !== 0) process.exit(proc.exitCode ?? 1);

for (const sub of ["backend", "web"]) {
  const p = Bun.spawnSync(["bun", "install"], { cwd: resolve(root, sub), stdio: ["inherit", "inherit", "inherit"] });
  if (p.exitCode !== 0) process.exit(p.exitCode ?? 1);
}

console.log("\n✅ Setup complete! Next steps:");
console.log("  1. Edit .env (infra/frontend) and backend/.env (backend runtime)");
console.log("  2. bun run infra:up    - start PostgreSQL + MinIO");
console.log("  3. bun run dev         - start backend + frontend");
