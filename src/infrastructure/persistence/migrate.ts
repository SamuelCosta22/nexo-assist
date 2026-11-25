import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { isNeonUrl } from "./database";

/** Applies the SQL migrations in ./drizzle to the database behind `url`. */
export async function runMigrations(url: string): Promise<void> {
  if (isNeonUrl(url)) {
    await migrateNeon(drizzleNeon({ client: neon(url) }), { migrationsFolder: "./drizzle" });
    return;
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrateNodePg(drizzleNodePg({ client: pool }), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
