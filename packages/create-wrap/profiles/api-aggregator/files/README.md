# {{APP_NAME}}

External-API aggregator built on [@donilite/wrap](https://github.com/DoniLite/wrap#readme) — Hono + Bun, decorator-driven. **No database** — this profile is service-oriented: it declares `WrapService`s that call out to upstream APIs, fronted by `RouterController`s, mainly to get typed routes and OpenAPI docs over data this app doesn't own.

## Getting started

Prerequisite: [Bun](https://bun.sh) ≥ 1.2 — no Docker, no Postgres, no Redis needed.

```bash
bun run init:env  # copy .env.example -> .env
bun run dev        # http://localhost:5000/docs (Swagger UI)
bun test           # test suite
```

## Project structure

```text
src/
├── bootstrap.ts          # env — always the first import
├── index.ts              # Hono app, middlewares, Bun.serve
├── index.controller.ts   # API router (mounts each feature)
├── config/                # app configuration (env-driven, incl. externalApi.baseUrl)
├── factory/web.factory.ts # Variables + WrapRegistry augmentation
├── helpers/                # app-owned helpers (roles, ...)
├── middleware/auth.ts     # auth stack, available if a route needs it
└── features/
    └── aggregator/         # a vertical slice fronting an upstream API
        ├── DTO/             # zod-backed DTOs (SchemaDTO, not entity-derived)
        ├── services/        # WrapService subclass (fetch, no repository)
        └── web/             # RouterController subclass (@Get, @Post, ...)
tests/                     # bun:test suites (fetch stubbed, no network calls)
```

## Creating a feature

1. **DTO** — `SchemaDTO(z.object({ ... }))` shaping what you return, see `src/features/aggregator/DTO/aggregator.dto.ts`. Add a request DTO too (`CheckUpstreamRequestDTO`) for anything a caller supplies — that's what gets validated.
2. **Service** — extend `WrapService`, inject `fetch` (or an SDK client) as a constructor param so it's stubbable in tests, see `src/features/aggregator/services/aggregator.service.ts`.
3. **Controller** — extend `RouterController`, mount it from `src/index.controller.ts` with `this.register(YourController)`.

**Same `@Service()` + `@ValidateDTO()` convention as an entity-backed service** — this isn't a special DB-free variant: `AggregatorService` is `@Service()`-decorated (so `ServiceFactory.getService()` singleton-caches it, same as `BaseController` does for entity-backed services) and its `checkUpstream()` method — the one that takes caller-supplied input (a URL to check) — is `@ValidateDTO()`-decorated, validating it against `CheckUpstreamRequestDTO`'s zod schema before the method body runs. `probe()`, the internal method that takes a caller-CONTROLLED (not user-supplied) URL — `appConfig.externalApi.baseUrl` — isn't decorated, since there's nothing user-supplied to validate there. Follow the same split for your own services: `@ValidateDTO()` on anything fed from a request body/params, plain methods for anything the app itself controls.

Add more upstreams as more entries in `appConfig.externalApi` (or a map, if you front several) — see `src/config/app.config.ts`.

## Growing into a database

If this project later needs to persist data of its own (not just aggregate), look at the full-backend profile scaffolded by the same CLI (`bunx @donilite/create-wrap@latest` → "Full backend"): copy its `src/bootstrap.ts` (adds `initializeDatabase()`), `drizzle.config.ts`, `compose.yml`, and `src/db/index.ts`, then switch a feature's `WrapService`/`RouterController` to `BaseService<Repo>`/`BaseController<Service>`.

## Useful commands

| Command | Description |
| --- | --- |
| `bun run dev` | dev server with hot reload |
| `bun test` | test suite |
| `bun run typecheck` / `bun run lint` | static checks |
