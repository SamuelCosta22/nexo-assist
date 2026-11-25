import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Driver-agnostic handle. Production uses Neon over HTTP (stateless, ideal for
 * serverless); local development can use any Postgres (see docker-compose.yml);
 * integration tests use an in-memory Postgres (PGlite). All of them run the same
 * repositories, so what the tests verify is what ships.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Neon's HTTP driver only speaks to Neon; every other URL is a regular Postgres. */
export const isNeonUrl = (url: string) => new URL(url).hostname.endsWith(".neon.tech");

export function createDatabase(url: string): Database {
  if (isNeonUrl(url)) return drizzleNeon({ client: neon(url), schema });
  // A small pool: serverless instances multiply, and each connection is precious.
  return drizzleNodePg({ client: new Pool({ connectionString: url, max: 5 }), schema });
}

export { schema };
