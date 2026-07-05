/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test utilities — import from "@donilite/wrap/testing".
 *
 * - `createTestDatabase` boots an isolated database (in-process PGlite by
 *   default, or a real Postgres via `url`), pushes the schema and injects
 *   it into the framework so repositories/services/controllers work as-is.
 * - `testContext` builds a minimal Hono context for direct service calls.
 * - `requestJson` is sugar over `app.request()` for controller tests.
 *
 * Requires dev dependencies in the app: `@electric-sql/pglite` (default
 * mode) and `drizzle-kit` (schema push).
 */
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { Context, Hono } from "hono";
import { resetDatabase, setDatabase, type WrapDatabase } from "../database";
import { getCacheStore } from "../middleware/cache.middleware";
import type { RegisteredSchema } from "../registry";

export interface TestDatabaseOptions {
  /** The app's drizzle schema object — `import * as schemas from "@/db"`. */
  schema: RegisteredSchema;
  /**
   * Connection string of a real Postgres (integration/e2e tests).
   * Default: an in-process PGlite instance (no docker needed).
   */
  url?: string;
}

export interface TestDatabase {
  /** Direct handle for arranging data in tests. */
  db: WrapDatabase;
  /** Empty every table of the schema (keeps the structure). */
  truncateAll(): Promise<void>;
  /** Close the connection and unregister the injected database. */
  destroy(): Promise<void>;
}

/**
 * Boot an isolated test database, push the schema and inject it into
 * the framework. Call once per test file (beforeAll) and `truncateAll`
 * between tests (beforeEach).
 */
export async function createTestDatabase(
  options: TestDatabaseOptions,
): Promise<TestDatabase> {
  let db: WrapDatabase;
  let close: () => Promise<void>;

  if (options.url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: options.url });
    db = drizzle(pool, { schema: options.schema }) as unknown as WrapDatabase;
    close = async () => {
      await pool.end();
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite();
    db = drizzle(client, { schema: options.schema }) as unknown as WrapDatabase;
    close = async () => {
      await client.close();
    };
  }

  // Create the tables directly from the schema objects — no migration
  // files needed for tests.
  const { pushSchema } = await import("drizzle-kit/api");
  const { apply } = await pushSchema(
    options.schema as Record<string, unknown>,
    db as any,
  );
  await apply();

  setDatabase(db);

  const tables = Object.values(
    options.schema as Record<string, unknown>,
  ).filter((value): value is PgTable => is(value, PgTable));

  return {
    db,
    async truncateAll() {
      for (const table of tables) {
        await db.execute(
          sql.raw(
            `TRUNCATE TABLE "${getTableName(table)}" RESTART IDENTITY CASCADE`,
          ),
        );
      }
      // Repository-level cache must not survive a truncate
      await getCacheStore().clear();
    },
    async destroy() {
      await close();
      await getCacheStore().clear();
      resetDatabase();
    },
  };
}

export interface TestContextOptions {
  /** JSON body returned by `c.req.json()` */
  json?: unknown;
  /** Query params returned by `c.req.query()` */
  query?: Record<string, string>;
  /** Form data returned by `c.req.formData()` */
  formData?: FormData;
}

/**
 * Minimal Hono context for calling services directly
 * (satisfies @ValidateDTO, c.get/c.set and c.json).
 */
export function testContext(options: TestContextOptions = {}): Context {
  const store = new Map<string, unknown>();
  return {
    req: {
      method: "TEST",
      path: "/test",
      json: async () => options.json ?? {},
      query: () => options.query ?? {},
      formData: async () => options.formData ?? new FormData(),
      header: () => undefined,
      param: () => undefined,
    },
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    json: (data: unknown, status?: number) =>
      new Response(JSON.stringify(data), {
        status: status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  } as unknown as Context;
}

export interface JsonResponse<T = any> {
  status: number;
  body: T;
  response: Response;
}

/**
 * Fire a JSON request against a controller app (`controller.getApp()`).
 */
export async function requestJson<T = any>(
  app: Pick<Hono, "request">,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<JsonResponse<T>> {
  const response = await app.request(path, {
    method,
    headers:
      body === undefined
        ? headers
        : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data: unknown = null;
  try {
    data = await response.clone().json();
  } catch {
    // non-JSON response
  }

  return { status: response.status, body: data as T, response };
}
