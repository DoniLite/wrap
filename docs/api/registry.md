---
title: Registry, database & lifecycle
parent: API reference
nav_order: 9
---

`packages/wrap/src/registry.ts`, `database.ts`, `transaction.ts`, `events.ts`.

## `WrapRegistry` — app-wide typing via declaration merging

```ts
export interface WrapRegistry {}
```

Empty by default, the same pattern as Hono's own `ContextVariableMap`. An app augments it once (typically in `src/factory/web.factory.ts` or a dedicated types file) to get full typing everywhere without threading generics through every controller/service/repository:

```ts
import type * as schemas from "@/db";

declare module "@donilite/wrap" {
  interface WrapRegistry {
    schema: typeof schemas;      // tables + relations → typed populate (`with`)
    variables: Variables;         // extra Hono context variables beyond `identity`
    roles: UserRoles;             // access-control roles used by @Can / guard()
    identity: MySessionShape;     // AuthController.authenticate()'s return shape
  }
}
```

Every field is optional — augment only what the app needs. Derived types, all exported from this module:

```ts
type RegisteredSchema = WrapRegistry["schema"];                       // falls back to {}
type AppSchema = ExtractTablesWithRelations<RegisteredSchema>;         // relational view, powers populate typing
type AuthIdentity = WrapRegistry["identity"];                          // falls back to Record<string, unknown> — no mandated `role`
type AppVariables = WrapRegistry["variables"] & { identity: AuthIdentity }; // `identity` is always present regardless of augmentation
type AppRoles = WrapRegistry["roles"];                                 // falls back to `string`
```

`AppVariables` is the `Variables` type parameter every `Hono<{ Variables: AppVariables }>` in the framework uses — `Wrap`, `RouterController`, middleware signatures. `AuthIdentity` deliberately has no mandated `role` field (see [Auth guide — no forced RBAC](../guide/auth.md#no-forced-rbac)); it's `Record<string, unknown>` until augmented.

## Database (`database.ts`)

```ts
type WrapDatabase = PgDatabase<PgQueryResultHKT, RegisteredSchema>;

interface DatabaseOptions {
  connectionString: string;
  schema: RegisteredSchema;   // e.g. `import * as schemas from "@/db"` — required for populate
  poolSize?: number;
  logger?: boolean | DrizzleLogger; // true → Wrap's own debug logger via the shared Logger
}

function initializeDatabase(options: DatabaseOptions): WrapDatabase;
function getDatabase(): WrapDatabase;      // throws if initializeDatabase() was never called
function setDatabase(instance: WrapDatabase): void; // inject a pre-built instance (testing / custom drivers)
function resetDatabase(): void;             // unregister without closing anything (testing)
function closeDatabase(): Promise<void>;    // drains the connection pool
```

`initializeDatabase()` must run once at bootstrap, **before** any controller/repository is instantiated — in the generated template, `src/bootstrap.ts` does this and is imported first by `src/index.ts`. Calling it again after the first successful call is a no-op (returns the already-initialized instance) rather than creating a second pool. `WrapDatabase` is driver-agnostic in type — `node-postgres` in real apps, `PGlite` in tests via [`createTestDatabase()`](testing.md#createtestdatabaseoptions) using `setDatabase()`.

## Transactions (`transaction.ts`)

```ts
function currentTransaction(): WrapDatabase | undefined;
async function withTransaction<T>(fn: () => Promise<T>): Promise<T>;
```

`withTransaction(fn)` runs `fn` inside a real database transaction, propagated implicitly to every repository call made anywhere inside `fn`'s async scope via `AsyncLocalStorage` — no `tx` parameter to thread through call signatures. `BaseRepository`'s `db` getter checks `currentTransaction() ?? getDatabase()` on every access, so it picks up the ambient transaction automatically.

```ts
await withTransaction(async () => {
  const user = await userRepository.create(dto);
  await profileRepository.create(ProfileDTO.from({ userId: user.id }));
  // a throw anywhere in here rolls back both creates
});
```

**Nesting**: a `withTransaction()` call made while already inside another one joins the ambient transaction rather than opening a second, nested one — there's a single commit point at the outermost call. **Entity events**: anything emitted via [`emitEntityEvent`](#entity-events-eventsts) inside the scope is buffered and only dispatched after the surrounding transaction actually commits — a rollback means the events never fire. [`BaseRepository.applyBatch()`](repositories.md#offline-first-sync) is built entirely on this primitive for its atomicity guarantee.

`deferUntilCommit(effect)` (marked `@internal`) is the buffering primitive `emitEntityEvent` uses — returns `false` (and does not buffer) when called outside any transaction, so the caller knows to run the effect immediately instead.

## Entity events (`events.ts`)

```ts
type EntityEventType = "created" | "updated" | "deleted";

interface EntityEvent<T = unknown> {
  type: EntityEventType;
  table: string;              // SQL table name
  data: T;                     // created/updated: the row(s); deleted: `{ ids }`
}

type EntityEventHandler = (event: EntityEvent) => void | Promise<void>;

function onEntityEvent(source: string | EntityLike, handler: EntityEventHandler): () => void; // returns an unsubscribe function
function emitEntityEvent(event: EntityEvent): void;
```

Emitted by `BaseRepository` after every write (`create`/`update`/`delete`/`deleteMultiple`, and indirectly by `applyBatch`). `source` can be an entity class, a raw table name string, or `"*"` for every entity:

```ts
onEntityEvent(Example, (event) => console.log(event.type, event.data));
onEntityEvent("*", (event) => audit(event)); // fires for every entity in the app
```

Powers two built-in consumers — [cache invalidation](helpers.md#cache-middleware--stores) (a repository's own cache scope self-invalidates on any write to that entity) and [realtime publication](realtime.md#bindentityevents) (`realtime.bindEntityEvents()` republishes every event to its matching WebSocket topic) — and is open to app-level handlers for anything else (audit logging, domain events, notifications). A handler that throws or rejects is caught and logged (`logger.warn(...)`) — one failing handler never breaks another handler or the write that triggered the event.
