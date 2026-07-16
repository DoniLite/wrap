# CLAUDE.md — {{APP_NAME}}

Scaffolded with `bunx @donilite/create-wrap@latest` (**lightweight-api** profile: no database, no cache, no realtime — routes + auth + OpenAPI docs). Full framework API reference: **[link the docs site here once deployed]**. See `README.md` in this project for the getting-started walkthrough — this file is LLM-oriented guidance on top of it.

## What's different from the full-backend profile

No `src/db/`, no `drizzle.config.ts`, no `compose.yml`, no repositories, no entities. `src/bootstrap.ts` only loads env — it does not call `initializeDatabase()`. Every feature is DTO + `WrapService` + `RouterController` (three pieces, not five) instead of the entity-backed DTO + Entity + Repository + Service + Controller shape.

## Adding a feature — the pattern (see `src/features/greeting/`)

1. **DTO** (`DTO/<name>.dto.ts`): `SchemaDTO(z.object({ ... }))` directly — there's no entity/table to derive it from.
2. **Service** (`services/<name>.service.ts`): `@Service() class FooService extends WrapService { ... }`. **Still `@Service()`-decorated** (so `ServiceFactory.getService()` singleton-caches it) and **still uses `@ValidateDTO()`** on any method that takes user-supplied input — this is the exact same convention as an entity-backed `BaseService`, not a special DB-free variant. `GreetingService.greet()` in this scaffold is the reference shape.
3. **Controller** (`web/<name>.controller.ts`): `@Controller({ basePath: "/foos" }) class FooController extends RouterController { constructor() { super(webFactory.createApp()); } ... }`.
4. Register it: `this.register(FooController)` in `src/index.controller.ts`'s constructor.

## Auth

`src/middleware/auth.ts` builds `auth` from `JwtCookieAuthController`. Guard a route with `@UseMiddleware([auth.authMiddleware])`; role-based access with `auth.requireRoles([...])` or the generic `auth.guard(predicate)` for anything that isn't role-based (permission/tenant/scope checks). Don't reach for a repository/DB for auth state in this profile — if you need persistent sessions or users, that's the signal this project has outgrown "lightweight" (see "Growing into a database" in `README.md`).

## Testing

No `createTestDatabase` anywhere in this profile's tests — there's no schema to push. Build a `Wrap`, `.register(IndexController)`, and drive requests with `requestJson(app.raw, method, path, body?)` from `@donilite/wrap/testing` (see `tests/wrap.test.ts`) — through the real composition, not a directly-instantiated controller.
