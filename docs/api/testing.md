---
title: Testing
parent: API reference
nav_order: 11
---

`packages/wrap/src/testing/index.ts` — import from `@donilite/wrap/testing`. Requires dev dependencies in the consuming app: `@electric-sql/pglite` (default in-process database mode) and `drizzle-kit` (schema push, no migration files needed for tests).

## `createTestDatabase(options)`

```ts
interface TestDatabaseOptions {
  schema: RegisteredSchema;  // the app's drizzle schema object — `import * as schemas from "@/db"`
  url?: string;                // a real Postgres connection string; default: in-process PGlite, no docker needed
}

interface TestDatabase {
  db: WrapDatabase;                    // direct handle for arranging data in tests
  truncateAll(): Promise<void>;         // empties every table, keeps structure; also clears the cache store
  destroy(): Promise<void>;             // closes the connection, clears the cache store, unregisters the database
}

async function createTestDatabase(options: TestDatabaseOptions): Promise<TestDatabase>
```

Boots an isolated database (PGlite by default — no external process needed — or a real Postgres via `url` for integration/e2e tests), pushes the schema directly via `drizzle-kit/api`'s `pushSchema` (no migration files required), and calls `setDatabase(db)` so every repository/service/controller in the app under test works completely unmodified — they call `getDatabase()` internally and have no idea it's a test database.

```ts
import { createTestDatabase, type TestDatabase } from "@donilite/wrap/testing";
import * as schemas from "@/db";

let testDb: TestDatabase;

beforeAll(async () => { testDb = await createTestDatabase({ schema: schemas }); });
beforeEach(async () => { await testDb.truncateAll(); });
afterAll(async () => { await testDb.destroy(); });
```

Call `createTestDatabase` once per test file (`beforeAll`), `truncateAll()` between tests (`beforeEach`) for isolation, `destroy()` once at the end (`afterAll`). `truncateAll()` also clears the [cache store](helpers.md#cache-middleware--stores) — a repository-level cache entry from one test must not leak into the next.

## `testContext(options?)`

```ts
interface TestContextOptions {
  json?: unknown;                 // returned by c.req.json()
  query?: Record<string, string>; // returned by c.req.query()
  formData?: FormData;             // returned by c.req.formData()
}

function testContext(options?: TestContextOptions): Context
```

A minimal plain-object stand-in for a Hono `Context` — **not `instanceof Context`** — built to satisfy exactly what a service call typically needs: `@ValidateDTO()` (see [Decorators](decorators.md#validatedtodtoclass-provider), which duck-types this shape as a fallback when `instanceof Context` fails), `c.get`/`c.set` (backed by a real `Map`, so state set during the call is readable afterward), and `c.json()` (returns a real `Response`). Use it to call a service method directly without going through HTTP:

```ts
const c = testContext({ json: { name: "Ada" } });
const dto = await CreateUserDTO.from(await c.req.json());
const user = await userService.create(dto, c);
```

`c.req.param()` and `c.req.header()` both return `undefined` unconditionally — this test double is for service-layer tests where path params and headers usually aren't the thing under test; for anything that depends on them, test through `requestJson()` against the real controller instead.

## `requestJson(app, method, path, body?, headers?)`

```ts
interface JsonResponse<T = unknown> {
  status: number;
  body: T;
  response: Response; // the raw Response, still readable (body was consumed via response.clone())
}

async function requestJson<T = unknown>(
  app: Pick<Hono, "request">,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<JsonResponse<T>>
```

Sugar over Hono's own `app.request()` for controller-level tests — sets `content-type: application/json` and JSON-stringifies `body` automatically when given, and parses the response body for you (falls back to `body: null` for a non-JSON response instead of throwing):

```ts
const controller = new UserController();
const { status, body } = await requestJson(controller.getApp(), "POST", "/", { name: "Ada" });
expect(status).toBe(201);
```

Works against any object exposing Hono's `.request()` — a controller's `getApp()`, or `Wrap`'s own [`.request`](wrap.md#request) getter for a full end-to-end test through the whole composed app.
