---
title: Decorators
parent: API reference
nav_order: 6
---

`packages/wrap/src/decorators/*.ts`. All decorators are backed by `reflect-metadata`; every generated project's `tsconfig.json` must have `experimentalDecorators`/`emitDecoratorMetadata` enabled (already set in the template).

## Class decorators

### `@Controller(options)`

```ts
interface ControllerDecoratorOptions {
  basePath: string;
  middleware?: MiddlewareHandler[];
  tags?: string[];
  description?: string;
}

function Controller(options: ControllerDecoratorOptions): ClassDecorator
```

```ts
@Controller({ basePath: "/users", tags: ["Users"], description: "User management" })
class UserController extends BaseController<UserService> {}
```

Stores the metadata (`getControllerMetadata(target)` reads it back) and registers the class in `CONTROLLER_CLASSES` (name → constructor). `basePath` feeds [Swagger path resolution](swagger.md#path-resolution) together with whatever `Wrap.register()`/`RouterController.register()` prefix and parent chain applied at runtime — see [controller mount tracking](#controller-mount-tracking) below. `tags` is the controller-wide OpenAPI tag list; a route's own `@Get({ tags })` (etc.) replaces it for that one operation.

### `@Repository(options)`

```ts
type RepositoryOptions = string | { tableName: string; cache?: boolean; cacheTTL?: number };
function Repository(options: RepositoryOptions): ClassDecorator
```

```ts
@Repository("UserRepository") // shorthand for { tableName: "UserRepository" }
class UserRepository extends BaseRepository<typeof User.table> {}
```

Registers the class in `REPOSITORY_CLASSES`. `cache`/`cacheTTL` here are metadata only — actual read-caching is opted into by setting `protected cacheTtl` directly on the repository (see [Repositories — caching](repositories.md#caching)); this decorator does not wire it automatically.

### `@Service(options?)`

```ts
interface ServiceOptions { name?: string; singleton?: boolean; }
function Service(options?: ServiceOptions): ClassDecorator
```

```ts
@Service()
class UserService extends BaseService<UserRepository> {}
```

Registers the class in `SERVICE_CLASSES` under `options.name ?? constructor.name`. `singleton` is metadata read by [`ServiceFactory`](helpers.md#servicefactory) when resolving instances — see below.

### `@DTO()`

```ts
function DTO(): ClassDecorator
```

```ts
@DTO()
class CreateUserDTO extends BaseDTO {}
```

Registers the class in `DTO_CLASSES` (name → constructor) — required for `@ValidateDTO()`'s auto-detection and for `SelectDTO`/`InsertDTO`/`PartialDTO` factory output to be resolvable by name. Every DTO produced by [the DTO factories](dto.md) is already decorated for you; add it manually only on a hand-written `BaseDTO` subclass.

## Method decorators — routing

### `@Route(options)` / `@Get` / `@Post` / `@Put` / `@Patch` / `@Delete`

```ts
interface RouteOptions {
  path?: string;
  method?: "get" | "post" | "patch" | "put" | "delete";
  middleware?: MiddlewareHandler[];
  description?: string;
  summary?: string;
  responses?: Record<number, { description: string; schema?: unknown }>;
  body?: unknown;
  params?: Record<string, { type: string; description?: string }>;
  query?: Record<string, { type: string; description?: string }>;
  deprecated?: boolean;
  tags?: string[]; // replaces (not merges with) the controller's own tags for this operation
}

function Get(options?: Omit<RouteOptions, "method">): MethodDecorator
function Post(options?: Omit<RouteOptions, "method">): MethodDecorator
function Put(options?: Omit<RouteOptions, "method">): MethodDecorator
function Patch(options?: Omit<RouteOptions, "method">): MethodDecorator
function Delete(options?: Omit<RouteOptions, "method">): MethodDecorator
```

```ts
@Get({ path: "/:id", summary: "Get user by ID" })
async getById(c: Context) { ... }
```

Appends `{ ...options, handler: propertyKey }` to the controller class's route list (`getRouteMetadata(target)`). `path` params (`:id`, `:id{[0-9]+}`) are auto-derived for Swagger from the path string itself — `params` only needs to be set to *override* type/description for a specific param, not to declare its existence. See [Swagger — path resolution](swagger.md#path-resolution).

### `@UseMiddleware(middleware)`

```ts
function UseMiddleware(middleware: MiddlewareHandler[]): MethodDecorator
```

```ts
@UseMiddleware([auth.authMiddleware])
@Get({ path: "/admin" })
async adminRoute(c: Context) { ... }
```

Prepends the given middlewares to whatever's already recorded for that method (`getMiddlewareMetadata(target, propertyKey)`) — runs *before* anything `@Can` adds (see below), regardless of decorator-application order on the method.

## Method decorators — access, validation, response shaping

### `@Can(allowedRoles)`

```ts
function Can(allowedRoles: readonly AppRoles[]): MethodDecorator
```

```ts
@Can(WRITE_ACCESS)
@Post({ path: "/" })
async create(c: Context) { ... }
```

Reads `c.get("identity")` (set by whatever `authMiddleware` ran earlier in the chain — `@Can` does **not** authenticate on its own, it only authorizes an identity that's already there) and checks `canAccess(identity.role, allowedRoles)`. `401`s if there's no identity at all, `403`s if the role doesn't match. Always **prepended** to the method's middleware list so it runs last regardless of where in the decorator stack it's written — see the ordering note in [Controllers](controllers.md#constructor).

`canAccess(role, allowed)` is exported standalone for use outside the decorator (e.g. inside a hand-written middleware or `AuthController.guard()` predicate — see [Auth](auth.md#jwtcookieauthcontroller-requireroles)).

### `@ValidateDTO(dtoClass?, provider?)`

```ts
function ValidateDTO<T extends object, B extends "json" | "query" | "formData">(
  dtoClass?: new (...args: unknown[]) => T,
  provider?: B, // default "json"
): MethodDecorator
```

```ts
@ValidateDTO(CreateUserDTO)
async create(dto: CreateUserDTO, c: Context) { ... }

@ValidateDTO(undefined, "query")
async list(query: PaginationQuerysDTO, c: Context) { ... }
```

Wraps the method: reads the request body via `c.req[provider]()`, resolves the target DTO class (explicit argument → the method's TypeScript parameter types via `design:paramtypes` → an already-DTO-typed argument's own constructor, in that order), runs `dtoClass.schema.safeParse(body)`, and either throws a `ValidationError(400, issues)` or replaces the matching argument with a validated DTO instance before calling through. Accepts both a real Hono `Context` and the `testContext()` test double from `@donilite/wrap/testing` (duck-typed fallback — checks for a callable `req[provider]`, not `instanceof Context`).

`ValidationError` is exported from this module too:

```ts
class ValidationError extends Error {
  constructor(
    public statusCode: ContentfulStatusCode,
    public errors: Array<{ property: string; constraints: Record<string, string>; value: unknown }>,
  );
}
```

`mapErrorToResponse` (see [Middleware — error handling](helpers.md#error-handling)) turns this into a structured `400` response automatically.

### `@Serialize(dto, options?)`

```ts
interface SerializeOptions { dto: SerializableDTOClass; isArray?: boolean; }
function Serialize(dto: SerializableDTOClass, options?: Omit<SerializeOptions, "dto">): MethodDecorator
```

```ts
@Serialize(UserResponseDTO)
@Get({ path: "/:id" })
async getById(c: Context) { return c.json(await this.service.findById(id)); }
```

Not applied by the decorator itself — `RouterController`'s route registration reads `getSerializeMetadata()` and wraps the handler so the *response* is parsed through `dto.schema` (unknown fields stripped, dates emitted as ISO strings) before being sent. `isArray` auto-detects from the handler's return value unless set explicitly. See [`serialize()`](helpers.md#serializedata-config) for the underlying function.

## Method decorators — cross-cutting

### `@Cache(options?)`

```ts
interface CacheOptions {
  ttl?: number; // seconds, default 300
  key?: string | ((args: unknown[]) => string);
  invalidateOn?: string[];
}
function Cache(options?: CacheOptions): MethodDecorator
```

```ts
@Cache({ ttl: 60, key: (args) => `report:${args[0]}` })
async expensiveReport(id: string) { ... }
```

Method-level memoization against the configured [`CacheStore`](helpers.md#cache-middleware--stores) (`getCacheStore()`) — independent of repository-level `cacheTtl` (which caches CRUD reads); this decorator caches the return value of *any* method call, keyed by `options.key` or `ClassName:methodName:JSON(args)` by default. A cache miss/error never throws — it falls through to calling the original method and warns to console.

### `@RateLimit(options)`

```ts
interface RateLimitOptions { max: number; window: number; message?: string; }
function RateLimit(options: RateLimitOptions): MethodDecorator
```

```ts
@RateLimit({ max: 10, window: 60 })
@Post({ path: "/login" })
async login(c: Context) { ... }
```

Metadata-only (`getRateLimitMetadata()`) — the controller's route registration reads it and wraps the route with [`rateLimitMiddleware(options)`](helpers.md#rate-limiting) at registration time, rather than the decorator wrapping the method body itself (unlike `@Cache`).

### `@ApiResponse(status, options)` / `@ApiTags(tags)`

```ts
function ApiResponse(status: number, options: { description: string; schema?: unknown }): MethodDecorator
function ApiTags(tags: string[]): ClassDecorator
```

```ts
@ApiResponse(200, { description: "User found", schema: UserResponseDTO })
@ApiResponse(404, { description: "User not found" })
@Get({ path: "/:id" })
async getById(c: Context) { ... }
```

Pure Swagger-spec metadata, folded into `generateSpec()`'s output — see [Swagger](swagger.md). `@ApiTags` is an alternative to `@Controller({ tags })` for setting a controller's tags after the fact (mutates the same `CONTROLLER_METADATA` entry).

## Controller mount tracking

`packages/wrap/src/decorators/registries.ts`. Not a decorator — a small runtime registry that closes the gap between a controller's *declared* `basePath` (from `@Controller`) and its *actual* mount path once controllers compose each other via `Wrap.register()` / `RouterController.register()` (parent → child, optionally with a `prefix`). Referenced from [Controllers — register()](controllers.md#register) and consumed by [`SwaggerGenerator`](swagger.md#path-resolution).

```ts
interface ControllerMountInfo {
  parent?: unknown;    // the controller class this one was registered under, or undefined for a root mount
  mountPath: string;    // this mount's own path segment (prefix + this controller's basePath), relative to its parent
}

const CONTROLLER_MOUNTS: Map<unknown, ControllerMountInfo>;

function recordControllerMount(controllerClass: unknown, mountPath: string, parent?: unknown): void;

function joinPath(...segments: string[]): string; // collapses slashes; "" / "/" segments drop out

function resolveControllerPath(controllerClass: unknown): string | undefined;
// walks the parent chain recorded by recordControllerMount, joining each
// segment; undefined if the controller was never registered (decorated but
// unused, or resolved before any register() call ran)
```

Both `Wrap.register(ControllerClass, options)` and `RouterController.register(ControllerClass, options)` call `recordControllerMount` on every mount — the former with no `parent` (root mount), the latter with `this.constructor` as `parent`. `resolveControllerPath` is what `SwaggerGenerator.generateSpec()` calls per controller; when it returns `undefined` (controller never actually registered), generation falls back to the bare `@Controller` `basePath`.

## Reading metadata directly

Every decorator above pairs with a getter, useful for tooling or a custom scanner:

```ts
getControllerMetadata(target): ControllerDecoratorOptions | undefined
getRouteMetadata(target): RouteOptions[] | undefined
getMiddlewareMetadata(target, propertyKey): MiddlewareHandler[] | undefined
getRepositoryMetadata(target): RepositoryOptions | undefined
getServiceMetadata(target): ServiceOptions | undefined
getCacheMetadata(target, propertyKey): CacheOptions | undefined
getRateLimitMetadata(target, propertyKey): RateLimitOptions | undefined
getSerializeMetadata(target, propertyKey): SerializeOptions | undefined
getSwaggerMetadata(target, propertyKey): Record<number, { description: string; schema?: unknown }> | undefined
```

Plus the class registries themselves, each with a `getX(name)`/`getAllX()` pair: `DTO_CLASSES`/`getDTOClass`/`getAllDTOs`, `REPOSITORY_CLASSES`/`getRepositoryClass`/`getAllRepositories`, `SERVICE_CLASSES`/`getServiceClass`/`getAllServices`, `CONTROLLER_CLASSES`/`getControllerClass`/`getAllControllers`.
