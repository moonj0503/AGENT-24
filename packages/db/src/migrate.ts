import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to apply the workflow migration.");
}

const migrationUrl = new URL("../migrations/0001_workflow.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");
const sql = postgres(databaseUrl);

try {
  await sql.unsafe(migration);
  console.log("Applied migration 0001_workflow.sql");
} finally {
  await sql.end();
}
