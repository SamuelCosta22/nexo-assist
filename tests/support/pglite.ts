import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "@/infrastructure/persistence/database";
import * as schema from "@/infrastructure/persistence/schema";

/** In-memory Postgres with the real migrations applied. */
export async function createTestDatabase(): Promise<Database> {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE users, helpdesk_articles, ticketing_tickets, ticketing_ticket_updates, ticketing_sequences, conversations, messages, pending_actions RESTART IDENTITY CASCADE`,
  );
}
