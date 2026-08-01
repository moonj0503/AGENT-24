import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { dbSchema } from "./schema.js";

export type Database = PostgresJsDatabase<typeof dbSchema>;

export function createDatabase(databaseUrl = process.env.DATABASE_URL): {
  db: Database;
  sql: postgres.Sql;
} {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to start the API with PostgreSQL.");
  }

  const sql = postgres(databaseUrl);
  return { db: drizzle(sql, { schema: dbSchema }), sql };
}
