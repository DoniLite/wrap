---
title: Wrap
parent: API reference
nav_order: 1
---

`packages/wrap/src/wrap.ts`. The composition root. See also: [Architecture guide](../guide/architecture.md).

## `new Wrap(options?)`

```ts
interface WrapOptions {
  cors?: Parameters<typeof import("hono/cors").cors>[0];
  bodyLimit?: number; // bytes, default 1 MB (1024 * 1024)
}
```

Constructing a `Wrap` immediately wires: `requestId()`, `secureHeaders()`, `cors(options.cors ?? {})`, `bodyLimit({ maxSize: options.bodyLimit ?? 1048576 })`, `requestLoggerMiddleware()`, `app.onError(errorHandler())`, and a JSON 404 handler (`ResponseHelper.error(...)`, status 404).

## `.with(pluginOrMiddleware)`

```ts
with(pluginOrMiddleware: MiddlewareHandler<{ Variables: AppVariables }> | AuthController): this
```

Two overload behaviors on one method, distinguished at runtime (`isAuthController(...)`, a brand check — not `instanceof`, which breaks across duplicated module instances):

- **An `AuthController` instance** → stored for `.swagger()` to read its `openApiSecurityScheme()`. **Not applied globally** — matches the common pattern of guarding only specific route groups. Apply it explicitly with `.use(path, auth.authMiddleware)` wherever needed.
- **A `MiddlewareHandler`** → `app.use(middleware)`, applied globally.

Returns `this` (chainable).

## `.register(ControllerClass, options?)`

```ts
register<C extends RouterController>(
  ControllerClass: new () => C,
  options?: string | RegisterOptions,
): this

interface RegisterOptions {
  prefix?: string;        // prepended in front of the controller's own @Controller basePath
  middlewares?: MiddlewareHandler<{ Variables: AppVariables }>[];
}
```

Instantiates `ControllerClass` (no-arg constructor), mounts its Hono app at `joinPath(prefix, controller's @Controller basePath)`. A plain `string` second argument is shorthand for `{ prefix: string }`.

`middlewares`, when given, is applied on `Wrap`'s own app **before** `.route()` attaches the child — so it guards the whole mount, including the child's bare path, regardless of when the child registered its own routes internally. This is the same primitive available on any `RouterController` (`this.register(...)`), so controllers can compose child controllers under themselves the same way — see [Controllers](controllers.md#register).

Records the mount (path + no parent, since this is a root mount) so [Swagger](swagger.md) can resolve the controller's real path later.

## `.swagger(config, uiOptions?)`

```ts
swagger(config: SwaggerConfig & { path?: string }, uiOptions?: Partial<SwaggerUIOptions>): this
```

`path` defaults to `"/docs"`. Builds a `SwaggerGenerator` with whatever `AuthController` was registered via `.with()` (if any), and calls its `setupSwaggerUI(app, path, uiOptions)`. When an `AuthController` is registered, `uiOptions` defaults to `{ withCredentials: true, persistAuthorization: true }` (your `uiOptions` argument still overrides these). Full spec-generation details: [Swagger reference](swagger.md).

## `.get` / `.post` / `.put` / `.patch` / `.delete`

```ts
get<P extends string>(path: P, ...handlers: WrapRouteHandler[]): this
post<P extends string>(path: P, ...handlers: WrapRouteHandler[]): this
put<P extends string>(path: P, ...handlers: WrapRouteHandler[]): this
patch<P extends string>(path: P, ...handlers: WrapRouteHandler[]): this
delete<P extends string>(path: P, ...handlers: WrapRouteHandler[]): this
```

Thin passthroughs to the underlying Hono app's own HTTP-verb methods — ad-hoc routes without a full `Controller` class. `handlers` accepts both `MiddlewareHandler` (must call `next()`, returns a `Promise`) and a terminal `Handler` (may return synchronously) mixed in the same call, mirroring how Hono itself accepts a chain ending in a route handler.

## `.use(path, ...middlewares)`

```ts
use<P extends string>(path: P, ...middlewares: MiddlewareHandler<{ Variables: AppVariables }>[]): this
```

Path-scoped middleware — `app.use("/admin/*", auth.authMiddleware)`.

## `.raw`

```ts
get raw(): Hono<{ Variables: AppVariables }>
```

The underlying Hono instance — the escape hatch for anything `Wrap` doesn't wrap directly: websocket upgrade routes (see [Realtime](realtime.md)), a custom `Bun.serve` topology, or any Hono API not proxied above.

## `.request`

```ts
get request(): Hono<{ Variables: AppVariables }>["request"]
```

The underlying Hono instance's `.request()`, bound — mirrors `Hono.request()` for direct testing (`await app.request("/path", { method, headers, body })`) without needing `.raw`.

## `.listen(port, hostname?, options?)`

```ts
listen(port: number, hostname?: string, options?: WrapListenOptions): ReturnType<typeof Bun.serve>

interface WrapListenOptions {
  websocket?: unknown; // forwarded to Bun.serve({ websocket }) as-is — see createRealtime()
}
```

`Bun.serve({ port, hostname, fetch: app.fetch, websocket: options?.websocket })`. Returns the `Bun.serve` `Server` instance — needed by `@donilite/wrap/realtime`'s `realtime.attach(server)` if realtime is wired up.

## Full composition example

```ts
import { Wrap } from "@donilite/wrap";
import { createRealtime } from "@donilite/wrap/realtime";

const app = new Wrap({ cors: { origin: appConfig.cors.origin, credentials: true } });

app.with(auth);
app.use("/admin/*", auth.authMiddleware);
app.register(IndexController);

if (appConfig.swagger.enabled) {
  app.swagger({ title: appConfig.swagger.title, version: appConfig.swagger.version });
}

const realtime = createRealtime({ redisUrl: process.env.REDIS_URL });
app.get("/realtime", realtime.upgrade);

const server = app.listen(appConfig.port, appConfig.host, { websocket: realtime.websocket });
realtime.attach(server);
realtime.bindEntityEvents();
```
