---
title: Helpers, storage, cache & middleware
parent: API reference
nav_order: 12
---

Everything else in the `@donilite/wrap` barrel: response/query/validation/hash/image/slug helpers, the storage abstraction, the cache and rate-limit systems, error handling, logging, seeders, and `ServiceFactory`.

## Response helpers

`packages/wrap/src/helpers/response.helper.ts`

```ts
class ResponseHelper {
  static success<T>(data: T, message?: string): { success: true; message?: string; data: T };
  static error(message: string, details?: unknown): { success: false; message: string; details?: unknown };
  static paginated<T>(items: T[], page: number, pageSize: number, total: number, message?: string): {
    success: true; message?: string; data: T[];
    pagination: { page, pageSize, total, totalPages, hasNext, hasPrev };
  };
}
```

The shape every framework-level error response (`mapErrorToResponse`, the global 404) already uses — reach for it in hand-written handlers to keep responses consistent across the app.

## `buildQuery(query)`

`packages/wrap/src/helpers/buildQuery.helper.ts` (default export)

```ts
function buildQuery<T extends Record<string, unknown>>(query: T): PaginationQuery
```

Turns a raw query-string object (`c.req.query()` — everything is a string or `string[]`) into a validated [`PaginationQuery`](repositories.md#pagination-query): known pagination keys (`page`, `pageSize`, `search`, `sortBy`, `sortOrder`, `includeDeleted`, `populateChildren`) are coerced to their proper types (numbers, booleans) and validated (`sortOrder` must be a real `SortOrder` value or it's dropped); every other key with a non-trivial value becomes an entry in `filters`. The result is parsed through `PaginationQuerysDTO.from(...)` before being returned, so the return value is always well-formed.

```ts
@Get({ path: "/" })
async list(c: Context) {
  const query = buildQuery(c.req.query());
  return c.json(await this.service.findPaginated(query));
}
```

## `ValidatorHelper`

`packages/wrap/src/helpers/validator.helper.ts`

```ts
class ValidatorHelper {
  static async validateDTO<T>(dtoClass: DTOClass<T>, data: unknown): Promise<{ valid: boolean; errors?: Array<{ property, constraints, value }> }>;
  static async validateArray<T>(dtoClass: DTOClass<T>, dataArray: unknown[]): Promise<{ valid: boolean; errors?: Record<number, Array<{...}>> }>;
}
```

A non-throwing alternative to `@ValidateDTO()`/`DTO.from()` — useful outside a decorated route handler (a seeder, a batch job, a CLI script) where throwing a `ValidationError` isn't the right control flow. `validateArray` reports errors per-index, keyed by the array position of each invalid item.

## Hashing

`packages/wrap/src/helpers/hash.helper.ts`

```ts
function hashSomething(data: string | Buffer): Promise<string>;             // Bun.password.hash(data, "bcrypt")
function compareHash(data: string | Buffer, hash: string): Promise<boolean>; // Bun.password.verify(data, hash, "bcrypt")
```

References the `Bun` global at call time rather than importing the `bun` module, so `@donilite/wrap` stays loadable under plain Node (e.g. by `drizzle-kit` during migrations) — only actually calling these two functions requires the Bun runtime.

## Image helpers

`packages/wrap/src/helpers/image.helper.ts` — base64 data-URI handling for direct-to-DB or direct-to-disk image uploads.

```ts
function base64ToBytes(base64String: string): Buffer;                        // strips a "data:...;base64," prefix if present
function getMimeTypeFromBase64(base64String: string): string | null | undefined; // reads the data-URI's declared MIME type
function getExtensionFromMimeType(mimeType: string): string;                  // e.g. "image/jpeg" -> "jpg"; unknown -> "bin"
function saveBase64ToFile(base64String: string, outputPath: string): Promise<void>; // Bun.write
function generateUniqueFilename(base64String: string, prefix?: string): string; // "<prefix>-<timestamp>-<random>.<ext>"
```

## `generateUpdateSlug(title)`

`packages/wrap/src/helpers/updates.helper.ts`

```ts
function generateUpdateSlug(title: string): string; // lowercase, spaces -> hyphens
```

## `DatabaseHelper`

`packages/wrap/src/helpers/database.helper.ts`

```ts
class DatabaseHelper {
  static async transaction<T>(callback: () => Promise<T>): Promise<T>;
  static async bulkInsert<T>(items: T[], insertFn: (batch: T[]) => Promise<void>, batchSize?: number): Promise<void>; // default batchSize 100
}
```

**`DatabaseHelper.transaction` is a placeholder** — it calls `callback()` directly and does **not** actually open a database transaction. Use [`withTransaction()`](registry.md#transactions-transactionts) for real atomicity; this method exists on the class but isn't wired to anything. `bulkInsert` is a real, useful chunking helper independent of that caveat — it just slices `items` into `batchSize`-sized chunks and awaits `insertFn` sequentially per chunk.

## Storage

`packages/wrap/src/storage/`

```ts
interface StoredFile {
  originalName: string; storagePath: string; mimeType: string; size: number; publicUrl: string;
}

interface StorageProvider {
  upload(file: File): Promise<StoredFile>;
  delete(storagePath: string): Promise<boolean>;
  exists(storagePath: string): Promise<boolean>;
  getPublicUrl(storagePath: string): string;
  getFile(storagePath: string): Promise<{ file: ReturnType<typeof Bun.file>; mimeType: string; size: number } | null>;
}

interface LocalStorageOptions { uploadDir?: string; baseUrl?: string; } // defaults: "./static/uploads", "/api/files/serve"
class LocalStorageProvider implements StorageProvider { constructor(options?: LocalStorageOptions); }

function configureStorage(options?: LocalStorageOptions & { provider?: "local" }): StorageProvider; // call at bootstrap; optional
function getStorageProvider(): StorageProvider; // singleton — defaults to a LocalStorageProvider if configureStorage was never called
```

`LocalStorageProvider` writes to disk via `Bun.write`, names files with a fresh `crypto.randomUUID()` + the original extension (never trusts the client-provided filename for storage), and creates `uploadDir` if it doesn't exist. There is currently exactly one provider (`"local"`) — the interface is deliberately provider-agnostic so an S3/GCS implementation can be dropped in later without changing call sites.

```ts
configureStorage({ uploadDir: "./uploads", baseUrl: "/files" }); // once, at bootstrap

@Post({ path: "/upload" })
async upload(c: Context) {
  const form = await c.req.formData();
  const file = form.get("file") as File;
  const stored = await getStorageProvider().upload(file);
  return c.json(stored);
}
```

## Cache

`packages/wrap/src/middleware/cache.middleware.ts` (in-memory backend + the pluggable interface) and `packages/wrap/src/cache/redis-cache.store.ts` (Redis backend).

```ts
interface CacheStore {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>; // entity-scope invalidation
  clear(): Promise<void>;
}

class MemoryCacheStore implements CacheStore {} // default backend, in-process Map
const defaultCacheStore: MemoryCacheStore;

function configureCache(config: { store?: CacheStore }): CacheStore; // call at bootstrap to swap backends
function getCacheStore(): CacheStore;                                 // the active backend — used by @Cache, cacheMiddleware, repositories
function entityCachePrefix(table: string): string;                     // "wrap:cache:<table>:" — the key prefix repository caching uses
```

**Auto-invalidation**: the module registers `onEntityEvent("*", ...)` at import time — any write to any entity wipes every cache key under that entity's `entityCachePrefix`, regardless of which cache consumer wrote it (repository `cacheTtl`, `@Cache`, or `cacheMiddleware`, as long as their keys share the prefix convention). A failed invalidation is swallowed (best-effort — worst case is a stale entry surviving until its TTL).

```ts
interface CacheMiddlewareOptions { ttl?: number; keyGenerator?: (c: Context) => string; store?: CacheStore; }
function cacheMiddleware(options?: CacheMiddlewareOptions): MiddlewareHandler
```

Route-level response caching, GET-only (non-GET requests pass through untouched): default key is `` `${method}:${path}:${JSON.stringify(query)}` ``; only caches a `200` JSON response.

```ts
app.use("/reports/*", cacheMiddleware({ ttl: 120 }));
```

### `RedisCacheStore`

```ts
interface RedisCacheStoreOptions { url?: string; namespace?: string; }
class RedisCacheStore implements CacheStore {
  constructor(options?: RedisCacheStoreOptions); // uses Bun.redis (the default connection) if `url` is omitted
  close(): void;
}
```

Built on `Bun.RedisClient` — zero extra dependency, but Bun-only (throws at construction if `Bun` isn't defined). `clear()` only ever deletes its own namespaced keys / the `wrap:cache:*` prefix — never `FLUSHDB`, since the Redis instance may be shared with other concerns.

```ts
configureCache({ store: new RedisCacheStore({ url: process.env.REDIS_URL, namespace: "myapp:" }) });
```

## Rate limiting

`packages/wrap/src/middleware/rate-limit.middleware.ts`

```ts
interface RateLimitStore {
  increment(key: string, window: number): Promise<{ count: number; resetAt: number }>;
  reset(key: string): Promise<void>;
}
class MemoryRateLimitStore implements RateLimitStore {} // default backend
const defaultRateLimitStore: MemoryRateLimitStore;

interface RateLimitMiddlewareOptions {
  max: number; window: number; // seconds
  message?: string;
  store?: RateLimitStore;                                // default: in-memory
  keyGenerator?: (c: Context) => string | Promise<string>; // default: client IP
}
function rateLimitMiddleware(options: RateLimitMiddlewareOptions): MiddlewareHandler
```

Sets `X-RateLimit-Limit`/`X-RateLimit-Remaining`/`X-RateLimit-Reset` headers on every response and `429`s with `{ error, retryAfter }` once `count > max` for the window. Default `keyGenerator` (`clientIdentifier`) checks `X-Forwarded-For`, then `X-Real-IP`, then falls back to Bun's own connection info (`hono/bun`'s `getConnInfo`, imported lazily so the package stays Node-loadable) — `"anonymous"` if none are available (e.g. outside Bun).

```ts
@RateLimit({ max: 5, window: 60 })
@Post({ path: "/login" })
async login(c: Context) { ... }
```

Note (see [Decorators — `@RateLimit`](decorators.md#ratelimitoptions)): the decorator is metadata-only — actual enforcement happens where the controller's route registration reads that metadata and wraps the route with `rateLimitMiddleware(options)`.

## Error handling

`packages/wrap/src/middleware/error-handler.middleware.ts`

```ts
function mapErrorToResponse(c: Context, error: unknown, context?: LogContext): Response;
function errorHandler(): ErrorHandler; // app.onError(errorHandler())
```

The single mapper used by both `Wrap`'s global `app.onError()` and `RouterController.handleError()` (see [Controllers](controllers.md#handleerrorc-error-protected)) — every error in the app produces the same response shape regardless of which circuit caught it. Logs via the shared [`logger`](#logger) before mapping. Mapping order:

1. `ValidationError` (thrown by `@ValidateDTO`) → its own `statusCode` (usually 400), `{ errors }`.
2. `z.ZodError` (a raw Zod validation failure not wrapped in `ValidationError`) → 400, same `{ errors }` shape.
3. `HTTPException` (Hono's own) → `error.getResponse()`, unmodified.
4. A plain `Error` whose `message` contains `"not found"` (the convention `BaseService.update`/`delete` use — see [Services](services.md)) → 404.
5. Any other `Error` → 500, `{ message: error.message, name: error.name }`.
6. Anything non-`Error` thrown → 500, generic message.

## Request logging

`packages/wrap/src/middleware/request-logger.middleware.ts`

```ts
function requestLoggerMiddleware(): MiddlewareHandler
```

Logs a `→ METHOD path` line on entry and a `← METHOD path STATUS (Nms)` line on completion, both via the shared logger, tagged with `c.get("requestId")` when Hono's own `requestId()` middleware ran first (it does, automatically, inside `new Wrap()` — see [Wrap](wrap.md#new-wrapoptions)).

## Response serialization

`packages/wrap/src/middleware/serialize.middleware.ts` — the runtime backing [`@Serialize`](decorators.md#serializedto-options).

```ts
interface SerializeConfig { dto: SerializableDTO; isArray?: boolean; }
function serialize<T>(data: unknown, config: SerializeConfig): T | T[] | null;
function createSerializer<T>(dto: SerializableDTO, options?: Omit<SerializeConfig, "dto">): (data: unknown) => T | T[] | null;
```

Parses `data` through [`toSerializationSchema(dto.schema)`](dto.md#toserializationschemaschema) (see [DTO](dto.md)) — unknown fields stripped, dates emitted as ISO strings. Handles a single object, an array, or a `{ items: [...] }` paginated envelope (detected automatically unless the DTO itself is already a `Paginated*` wrapper, in which case it's treated as a single object). A schema mismatch on an individual item doesn't throw or drop data — it logs a warning and returns the raw item unchanged, so one bad record never breaks a whole list response.

```ts
const serializeUser = createSerializer(UserResponseDTO);
return c.json(serializeUser(rawUser));
```

## Logger

`packages/wrap/src/logger.ts`

```ts
type LogLevel = "debug" | "info" | "warn" | "error";
interface LogContext { requestId?: string; className?: string; methodName?: string; [key: string]: unknown; }

class Logger {
  static getInstance(withLevel?: LogLevel): Logger; // singleton; LOG_LEVEL env var sets the initial level
  get level(): string;
  set level(level: LogLevel);
  debug(message: string, context?: LogContext, data?: unknown): void;
  info(message: string, context?: LogContext, data?: unknown): void;
  warn(message: string, context?: LogContext, data?: unknown): void;
  error(message: string, context?: LogContext, error?: unknown): void;
}

const logger: Logger; // = Logger.getInstance()
```

Every framework-internal log call (request logging, error handling, SQL query logging via `DatabaseOptions.logger`, entity-event handler failures) goes through this single instance — colorized, structured console output with special-cased inline formatting for HTTP context (`method`/`path`/`status`/`duration`) and SQL context (`query`/`params`). `protected logger` on `RouterController`/`WrapService`/`BaseRepository` is this same instance.

## `ServiceFactory`

`packages/wrap/src/factory/service.factory.ts`

```ts
class ServiceFactory {
  static getService<T, A>(serviceClass: new (...args: A[]) => T, ...makers: A[]): T;
}
```

A minimal singleton cache keyed by class reference — the first `getService(FooService, ...)` call constructs and caches the instance; every later call (with any arguments) returns the cached one. Used everywhere a controller needs its service: `super(ServiceFactory.getService(FooService, fooRepository))`.

## Seeders

`packages/wrap/src/seeders/base.seed.ts` and `runner.ts`

```ts
abstract class BaseSeeder<T extends { id?: string | number | null }, CreateDTO extends BaseDTO, UpdateDTO extends Partial<CreateDTO>, R extends BaseRepository> {
  constructor(protected repository: R, protected mocks: CreateDTO[], protected uniqueKey?: keyof T);
  protected areDataDifferent(mockData: CreateDTO, existingEntity: T): boolean; // shallow compare, skips "password"
  async run(): Promise<void>;
}

interface Seeder { run(): Promise<void>; }
class SeederRunner<C extends new () => Seeder> {
  constructor(protected seeders: C[]);
  async runAll(): Promise<void>;
}
```

`BaseSeeder.run()` upserts: for each mock, if `uniqueKey` is given, look up an existing row by that field (`repository.findOneBy`) — update it only if `areDataDifferent()` says the mock's fields actually diverge from the stored row (skips a `password` field specifically, since a plaintext seed value can never equal a stored hash), otherwise create it. Without `uniqueKey`, every mock is always created (no dedup). Logs `[CREATED]`/`[UPDATED]`/`[SKIPPED]` per row to the console.

```ts
class UserSeeder extends BaseSeeder<User, CreateUserDTO, Partial<CreateUserDTO>, UserRepository> {
  constructor(repo: UserRepository) { super(repo, [{ email: "admin@example.com", ... }], "email"); }
}

await new SeederRunner([UserSeeder]).runAll();
```
