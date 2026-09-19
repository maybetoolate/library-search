import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./index";
import { sql } from "drizzle-orm";

// Applies drizzle/extensions.sql (extensions + GIN indexes that
// drizzle-kit does not manage). Idempotent — safe to re-run.
async function setup() {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, "..", "..", "drizzle", "extensions.sql");
  const statements = (await readFile(file, "utf-8"))
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));

  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
  }
  console.log(`Applied ${statements.length} extension statements`);
  process.exit(0);
}

setup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
