import { neon } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Driver-agnostic handle. Production uses Neon over HTTP (stateless, ideal for
 * serverless); integration tests use an in-memory Postgres (PGlite). Both run
 * the same repositories, so what the tests verify is what ships.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createNeonDatabase(url: string): Database {
  return drizzle({ client: neon(url), schema });
}

export { schema };
