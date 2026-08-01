import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to apply the workflow migration.");
}

const migrationsUrl = new URL("../migrations/", import.meta.url);
const migrationNames = (await readdir(migrationsUrl))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const sql = postgres(databaseUrl);

try {
  for (const migrationName of migrationNames) {
    const migration = await readFile(new URL(migrationName, migrationsUrl), "utf8");
    await sql.unsafe(migration);
    console.log(`Applied migration ${migrationName}`);
  }
} finally {
  await sql.end();
}
