---
title: Controllers
parent: API reference
nav_order: 2
---

`packages/wrap/src/base.controller.ts`.

## `RouterController` (abstract)

Route-scanning base for any Hono-mounted controller — decorated-route registration, middleware assembly, error handling, **no service or repository attached**. Use directly for controllers that aren't backed by an entity (health checks, root/aggregation routes, or any [DB-free profile](../cli/create-wrap.md)'s feature controllers).

```ts
abstract class RouterController {
  protected app: Hono<{ Variables: AppVariables }>;
  protected options: ControllerOptions;
  protected logger: Logger;

  constructor(app: Hono<{ Variables: AppVariables }>, options?: ControllerOptions);

  protected handleError(c: Context, error: unknown): Response;
  protected registerCustomRoutes(): void; // override to add non-decorator routes manually

  public getApp(): Hono<{ Variables: AppVariables }>;
  public register<C extends RouterController>(ControllerClass: new () => C, options?: string | RegisterOptions): this;
}
```

### Constructor

```ts
constructor(app: Hono<{ Variables: AppVariables }>, options: ControllerOptions = {})

interface ControllerOptions {
  middlewares?: RouteMiddlewares;
  excludeRoutes?: string[]; // method names to skip registering entirely
}

interface RouteMiddlewares {
  all?: MiddlewareHandler[];                      // applied to every decorated route on this controller
  [methodOrHttpVerb: string]: MiddlewareHandler[] | undefined; // e.g. `get: [...]`, or a specific method name
}
```

Stores `app`/`options`. **Does not register routes here** — see "Lazy route registration" below.

`middlewares.all` applies to **every** route regardless of `@Can`/authorization decorators — it's an authentication-and-more gate, not scoped by role. `@Can` only ever adds a 403 check *after* whatever `middlewares.all` already required; it does not itself add authentication. A route-specific key (either the HTTP verb — `get`/`post`/`put`/`patch`/`delete` — or the exact method name) adds middleware to just that subset.

### `.getApp()`

```ts
getApp(): Hono<{ Variables: AppVariables }>
```

Triggers route registration (idempotent — safe to call more than once) and returns the underlying Hono app. This is the method a parent calls when mounting the controller (`instance.getApp()`), and it's the reason lazy registration works: by the time anything calls `.getApp()`, the controller's full constructor — including every `this.register(Child)` it made — has already finished.

### `.register(ControllerClass, options?)`

```ts
register<C extends RouterController>(ControllerClass: new () => C, options?: string | RegisterOptions): this

interface RegisterOptions {
  prefix?: string;
  middlewares?: MiddlewareHandler<{ Variables: AppVariables }>[];
}
```

Identical primitive to `Wrap.register()` (see [Wrap](wrap.md#registercontrollerclass-options)), available on any controller so it can compose child controllers under itself. `middlewares` is applied on *this* controller's own app before the child is mounted, guarding the whole mount including the child's bare path.

### `registerCustomRoutes()` (protected, override point)

```ts
protected registerCustomRoutes(): void {} // no-op by default
```

Runs after decorated-route registration, during the same lazy `.getApp()` trigger. Override it for anything not expressible as a `@Get`/`@Post`/etc.-decorated method — manual `this.app.route(...)` calls, for example (though `this.register(...)` is almost always the better fit for mounting another controller).

### Lazy route registration — why, precisely

A controller's own decorated routes (`@Get`, `@Post`, ...) are scanned and registered on first `.getApp()` call, **not in the constructor**. This is deliberate: `super()` always runs before a subclass's own constructor body, so registering eagerly in the base constructor would mean a controller's own routes (including any `:id`-style one) always land in Hono's router *before* any `this.register(Child)` call made afterward in the subclass body. Hono's router is purely registration-order-dependent for overlapping patterns (no automatic static-over-param priority) — a parent's own `GET /:id` registered first would silently swallow every request meant for a child mounted at a static prefix (`/occupants` structurally matches `:id` too). Deferring to `.getApp()` — called only once the whole constructor (all `register()` calls included) has run — registers every child first and this controller's own routes last, at any nesting depth.

### `handleError(c, error)` (protected)

```ts
protected handleError(c: Context<{ Variables: AppVariables }>, error: unknown): Response
```

Delegates to `mapErrorToResponse(c, error, { className: this.constructor.name })` — the same mapping `Wrap`'s global `app.onError()` uses, so both circuits answer with an identical shape. Call it from a route handler's `catch`.

## `BaseController<Service>` (abstract, extends `RouterController`)

```ts
abstract class BaseController<
  Service extends BaseService<any, any, any> = BaseService<any, any, any>,
> extends RouterController {
  protected service: Service;
  constructor(service: Service, app: Hono<{ Variables: AppVariables }>, options?: ControllerOptions);
}
```

Adds a typed `service` field on top of `RouterController` — everything else (route scanning, `register()`, error handling, lazy registration) is inherited unchanged.

```ts
@Controller({ basePath: "/foos", tags: ["Foos"] })
class FooController extends BaseController<FooService> {
  constructor() {
    super(ServiceFactory.getService(FooService), webFactory.createApp());
  }

  @Get({ path: "/:id" })
  async getById(c: Context) {
    try {
      const item = await this.service.findById(c.req.param("id")!);
      if (!item) return c.json({ success: false, message: "Not found" }, 404);
      return c.json(item);
    } catch (e) {
      return this.handleError(c, e);
    }
  }
}
```

## Free functions

### `mountController(app, mountPath, childApp, middlewares?)`

```ts
function mountController(
  app: Hono<{ Variables: AppVariables }>,
  mountPath: string,
  childApp: Hono<{ Variables: AppVariables }>,
  middlewares?: MiddlewareHandler<{ Variables: AppVariables }>[],
): void
```

Shared by `Wrap.register()` and `RouterController.register()`. If `middlewares` is non-empty, applies each on `app` at `mountPath === "/" ? "*" : \`${mountPath}/*\`` before calling `app.route(mountPath, childApp)`.

### `joinPath(...segments)`

Re-exported from `decorators/registries.ts` — see [Decorators — controller mount tracking](decorators.md#controller-mount-tracking).
