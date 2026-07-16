# CLAUDE.md — {{APP_NAME}}

This project was scaffolded with `bunx @donilite/create-wrap` (**full-backend** profile: Postgres + Drizzle, Redis cache, realtime websockets, auth — everything). This file orients an LLM assistant working in *this* generated app. Full framework API reference (every class, every function, every parameter): **[link the docs site here once deployed]**.

## Stack

Bun + Hono + Drizzle (Postgres) + Zod, composed through `@donilite/wrap`. Vertical-slice architecture: each feature owns its own `entity/`, `repository/`, `services/`, `web/` (controllers), `DTO/` under `src/features/<name>/`.

## Entry point and boot order

1. `src/index.ts` — imports `./bootstrap` **first** (env + `initializeDatabase()`, must run before any repository/controller is instantiated), then composes the app: `new Wrap({ cors })` → `.with(auth)` → `.use("/admin/*", auth.authMiddleware)` → `.register(IndexController)` → `.swagger({...})` (if `appConfig.swagger.enabled`) → realtime wiring via `.raw`/`.get("/realtime", ...)` → `.listen(port, host, { websocket })`.
2. `src/index.controller.ts` — `IndexController extends RouterController` (no service — it's a root/health controller, not entity-backed). Its constructor composes feature controllers as children: `this.register(ExampleController)`. **This is the pattern to follow when adding a new feature**: don't register a new controller directly on `Wrap` in `index.ts` — add `this.register(YourController)` inside `IndexController`'s constructor (or nest further if it makes sense), so the parent → children tree stays the single place routes are composed.
3. `src/config/app.config.ts` — one `appConfig` object, all env-driven, typed. Add new config here, not scattered `process.env` reads elsewhere.
4. `src/middleware/auth.ts` — constructs `auth = new JwtCookieAuthController({ secret, secureCookies })` and derives `authMiddleware`, `setupCookieSession`, `clearCookieSession`, `adminMiddleware` from it. Swap `JwtCookieAuthController` for your own `AuthController` subclass to change auth paradigm (DB-backed sessions, API keys, ...) — nothing else in the app depends on the concrete strategy, only on the `AuthController` contract.

## Adding a feature (the pattern every existing feature follows — see `src/features/example/`)

1. **Entity** (`entity/<name>.entity.ts`): `class Foo extends Entity("foos", { name: text("name").notNull() }, { relations: ({ many }) => ({ ... }) }) {}`. `id`/`createdAt`/`updatedAt`/`deletedAt` are added automatically. Export `FooTable = Foo.table` and `FooRelations = relationsOf(Foo)` — both required for `drizzle-kit` and populate typing. Add the entity module to `src/db/index.ts`'s barrel.
2. **DTOs** (`DTO/<name>.dto.ts`): `FooBase = SelectDTO(Foo, { exclude: [...] })` (read shape), `class CreateFooDTO extends InsertDTO(Foo) {}` (create shape, base columns excluded automatically), `UpdateFooDTO = PartialDTO(CreateFooDTO)`.
3. **Repository** (`repository/<name>.repository.ts`): `@Repository("FooRepository") class FooRepository extends BaseRepository<typeof Foo.table, CreateFooDTO, Partial<CreateFooDTO>> { protected table = Foo.table; }`. Set `relationalQuery`/`defaultWith` if the entity has relations you want populatable; `searchableFields` for `findPaginated`'s search; `cacheTtl` to opt into entity-scope caching.
4. **Service** (`services/<name>.service.ts`): `@Service() class FooService extends BaseService<FooRepository> { constructor() { super(new FooRepository()); } }`. A feature that isn't entity-backed (calls an external API, pure orchestration) uses `WrapService` instead — no repository generic — but still `@Service()`-decorated and still uses `@ValidateDTO()` on any method that takes user input, same convention.
5. **Controller** (`web/<name>.controller.ts`): `@Controller({ basePath: "/foos", tags: ["Foos"] }) class FooController extends BaseController<FooService> { constructor() { super(ServiceFactory.getService(FooService), webFactory.createApp()); } }`, then `@Get`/`@Post`/`@Put`/`@Delete`-decorated methods. Apply auth per-route with `@UseMiddleware([auth.authMiddleware])` and `@Can(SOME_ACCESS)`, or controller-wide via the `super()` options' `middlewares: { all: [...] }` (careful: that applies to *every* route on the controller regardless of `@Can` — `@Can` is a 403 authorization check layered *after* authentication, not a way to add authentication itself).
6. Register it: `this.register(FooController)` in `IndexController`'s constructor (or wherever it belongs in the controller tree).

## Testing

`bun test` runs everything under `tests/`. Pattern (see `tests/example.*.test.ts`): `createTestDatabase({ schema })` in `beforeAll` (in-process PGlite, no docker), `truncateAll()` in `beforeEach`, `destroy()` in `afterAll`. `requestJson(app, method, path, body?)` for HTTP-level controller tests — prefer driving requests through the real `Wrap`/`IndexController` composition (`app.request(...)` or `app.raw`) over instantiating a controller directly, so the test actually exercises the same tree production traffic goes through.

## Commands

`bun run dev` (hot reload) · `bun run build`/`typecheck`/`lint`/`test` · `bun run wake:db`/`push:db`/`migrate:db`/`generate:migrations` (Postgres via `compose.yml`) · `bun run init:all` (first-time setup: env + install + DB up + migrate).

## Conventions

- Don't reach for `db`/`getDatabase()` directly in a controller or service — go through a repository. Repositories are the only layer that touches Drizzle directly; this is what makes offline sync (`findChangedSince`/`applyBatch`), entity-scope caching, and entity events all work without every feature reimplementing them.
- Multi-write operations that must be atomic: wrap them in `withTransaction(async () => { ... })` (`@donilite/wrap`) rather than threading a `tx` parameter — it propagates implicitly via `AsyncLocalStorage` to every repository call in scope.
- No comments explaining *what* code does — only *why*, when it's non-obvious. Match the existing codebase's comment density, not more.
