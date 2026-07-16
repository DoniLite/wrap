---
title: Architecture
parent: Guides
nav_order: 1
has_children: false
---

## The composition root: `Wrap`

Every app builds one `Wrap` instance and composes it fluently:

```ts
const app = new Wrap({ cors: { origin: [...] } });
app.with(auth);                 // register an AuthController — see below
app.use("/admin/*", auth.authMiddleware); // path-scoped middleware, applied directly
app.register(IndexController);   // mount the root controller
app.swagger({ title, version }); // OpenAPI + Swagger UI, if wanted
const server = app.listen(port, host);
```

`Wrap` owns: the underlying `Hono` instance, the default middleware stack (`requestId`, `secureHeaders`, `cors`, `bodyLimit`, request logging), unified error handling (`app.onError`) and 404 shape, controller registration, and Swagger wiring. `.get/.post/.put/.patch/.delete/.use` cover ad-hoc routes and path-scoped middleware without a full controller class. `.request()` mirrors `Hono.request()` for direct testing. `.raw` is the escape hatch to the underlying `Hono` instance for anything `Wrap` doesn't wrap — realtime's websocket upgrade, a custom `Bun.serve` topology. Full signatures: [API reference — Wrap](../api/wrap.md).

## Vertical-slice features

Each feature owns its own slice under `src/features/<name>/`:

```text
features/foo/
├── entity/foo.entity.ts        # Entity(...) — the Drizzle table, single source of truth
├── DTO/foo.dto.ts               # SelectDTO/InsertDTO/PartialDTO, all derived from the entity
├── repository/foo.repository.ts # BaseRepository<typeof Foo.table>
├── services/foo.service.ts      # BaseService<FooRepository>
└── web/foo.controller.ts        # BaseController<FooService>
```

Not every feature needs all five pieces — see "Lighter bases" below.

## Controller → Service → Repository, and their lighter bases

| Full shape (entity-backed) | Lighter base (no entity) | When |
|---|---|---|
| `BaseController<Service>` | `RouterController` | No CRUD service — health/root routes, or any DB-free feature's controller |
| `BaseService<Repo>` | `WrapService` | No repository — orchestration, an external-API-calling service, email, ... |
| `BaseRepository<Tb>` | *(none — repositories are always entity-backed)* | Only exists when there's a Drizzle table |

`BaseController` *extends* `RouterController` (adds the `service` field); `BaseService` *extends* `WrapService` (adds the `repository` field and CRUD methods) — the lighter base isn't a separate code path, just fewer assumptions. A `WrapService`-based feature still follows the same `@Service()` + `@ValidateDTO()` convention as an entity-backed one: decorate the class, decorate any method that takes user-supplied input.

`BaseRepository` is the only layer that touches Drizzle directly. Every entity's `BaseRow` columns (`id`, `createdAt`, `updatedAt`, `deletedAt`) are what make generic CRUD, soft-delete, entity-scope caching, entity events, and [offline-first sync](sync.md) all work without a feature reimplementing them. Full signatures: [Controllers](../api/controllers.md), [Services](../api/services.md), [Repositories](../api/repositories.md).

## Parent → children composition, and why registration order matters

A controller composes child controllers in its own constructor:

```ts
@Controller({ basePath: "/" })
class IndexController extends RouterController {
  constructor() {
    super(webFactory.createApp());
    this.register(ExampleController);       // mounted at ExampleController's own basePath
    this.register(AdminController, {         // ...optionally prefixed and/or middleware-guarded
      prefix: "/admin",
      middlewares: [auth.authMiddleware],
    });
  }
}
```

`Wrap.register()` is the exact same primitive at the top level. A controller's real mount path is `prefix + childBasePath`, relative to whatever it's registered under — resolved at runtime, not statically knowable from a class's own `@Controller` decorator alone (this is also why Swagger needs to walk the registration chain — see [Swagger](swagger.md)).

**Route registration is lazy, on purpose.** A controller's own `@Get`/`@Post`/etc. routes are *not* registered in its constructor — they're registered the first time `.getApp()` is called, which only happens once the controller's full constructor (including every `this.register(Child)` call in its body) has already run, and exactly when its parent mounts it. This means every controller's own routes land in Hono's router *after* all of its children's, at every nesting depth. It matters because Hono's router is purely registration-order-dependent for overlapping patterns — a parent's own `GET /:id` registered before a child at a static prefix (e.g. `/occupants`) would otherwise silently swallow every request meant for that child (`:id` structurally matches the literal string `"occupants"` too). This was a real, previously-shipped bug; the fix is the lazy-registration design described here.

## Registry-driven typing

Apps opt into typed `db.query.*`/populate, typed Hono context variables, typed roles, and a typed `c.get("identity")` by augmenting `WrapRegistry` via TypeScript declaration merging:

```ts
declare module "@donilite/wrap" {
  interface WrapRegistry {
    schema: typeof schemas;   // tables + relations -> typed populate
    variables: Variables;     // Hono context variables
    roles: UserRoles;          // access-control roles
    identity: MyIdentityShape; // AuthController.authenticate()'s return shape
  }
}
```

All four are independent and optional — adopt whichever your app's shape needs. Full details: [Registry](../api/registry.md).

## Errors

`mapErrorToResponse()` (`middleware/error-handler.middleware.ts`) is the single mapping used by both `app.onError(errorHandler())` (global) and `BaseController`/`RouterController`'s own `this.handleError(c, error)` — both circuits produce an identical response shape regardless of where an error is caught. `ValidationError`/`ZodError` → 400, `HTTPException` → its own response, an `Error` whose message contains `"not found"` → 404, any other `Error` → 500.
