import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import type { Logger as DrizzleLogger } from "drizzle-orm/logger";
import { Logger } from "./logger";
import type { RegisteredSchema } from "./registry";

/**
 * The database handle used by repositories — driver-agnostic
 * (node-postgres in apps, PGlite in tests) but bound to the
 * registered schema for typed relational queries.
 */
export type WrapDatabase = PgDatabase<PgQueryResultHKT, RegisteredSchema>;

class WrapDrizzleLogger implements DrizzleLogger {
  logQuery(query: string, params: unknown[]): void {
    Logger.getInstance().debug("SQL Query", {
      query,
      params: JSON.stringify(params),
    });
  }
}

export interface DatabaseOptions {
  /** Postgres connection string */
  connectionString: string;
  /**
   * The app's drizzle schema object (tables + relations) — usually
   * `import * as schemas from "@/db"`. Required for populate (db.query).
   */
  schema: RegisteredSchema;
  poolSize?: number;
  /** true → wrap's debug logger; or bring your own drizzle logger */
  logger?: boolean | DrizzleLogger;
}

let pool: Pool | undefined;
let db: WrapDatabase | undefined;

/**
 * Initialize the database connection. Call it once at bootstrap,
 * BEFORE any controller/repository is instantiated (in the starter:
 * `src/bootstrap.ts`, imported first by `src/index.ts`).
 */
export function initializeDatabase(options: DatabaseOptions): WrapDatabase {
  if (db) return db;

  pool = new Pool({
    connectionString: options.connectionString,
    max: options.poolSize,
  });

  const logger =
    options.logger === true
      ? new WrapDrizzleLogger()
      : options.logger === false
        ? undefined
        : options.logger;

  db = drizzle(pool, {
    schema: options.schema,
    logger,
  });

  return db;
}

/** Access the initialized database. Throws if initializeDatabase() was not called. */
export function getDatabase(): WrapDatabase {
  if (!db) {
    throw new Error(
      "Database not initialized. Call initializeDatabase({ connectionString, schema }) " +
        "at bootstrap, before instantiating controllers or repositories.",
    );
  }
  return db;
}

/**
 * Inject an already-built drizzle instance (any pg driver) — used by
 * the testing utilities (PGlite) or custom drivers.
 */
export function setDatabase(instance: WrapDatabase): void {
  db = instance;
}

/** Unregister the database without closing anything (testing). */
export function resetDatabase(): void {
  db = undefined;
  pool = undefined;
}

/** Graceful shutdown: drain the connection pool. */
export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}
