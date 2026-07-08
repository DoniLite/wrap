# {{APP_NAME}}

Auth-only / lightweight API built on [@donilite/wrap](https://github.com/DoniLite/wrap#readme) — Hono + Bun, decorator-driven. **No database** — this profile is for apps that just need routes, auth and OpenAPI docs (a BFF, an internal tool, a service that owns no data of its own).

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
├── config/                # app configuration (env-driven)
├── factory/web.factory.ts # Variables + WrapRegistry augmentation
├── helpers/                # app-owned helpers (roles, ...)
├── middleware/auth.ts     # auth stack built from config
└── features/
    └── greeting/          # a vertical slice with NO repository/entity
        ├── DTO/            # zod-backed DTOs (SchemaDTO, not entity-derived)
        ├── services/       # WrapService subclass (no repository attached)
        └── web/            # RouterController subclass (@Get, @Post, ...)
tests/                     # bun:test suites
```

## Creating a feature

A DB-free feature has three pieces instead of five (no entity, no repository):

1. **DTO** — `SchemaDTO(z.object({ ... }))`, see `src/features/greeting/DTO/greeting.dto.ts`.
2. **Service** — extend `WrapService` (not `BaseService<Repo>`), see `src/features/greeting/services/greeting.service.ts`. Inject other services, call external APIs, whatever the feature needs.
3. **Controller** — extend `RouterController` (not `BaseController<Service>`), see `src/features/greeting/web/greeting.controller.ts`. Mount it from `src/index.controller.ts` with `this.register(YourController)`.

**Same `@Service()` + `@ValidateDTO()` convention as an entity-backed service** — this isn't a special DB-free variant: decorate the service class with `@Service()` (so `ServiceFactory.getService()` singleton-caches it, same as `BaseController` does for entity-backed services) and decorate any method that takes user-supplied input with `@ValidateDTO()` — it validates the request body against the DTO's zod schema and replaces the argument with the parsed instance before your method body runs. `GreetingService.greet()` does exactly this; follow the same shape for your own DB-free services.

Guard a route with `auth.authMiddleware` (see `@UseMiddleware([auth.authMiddleware])` on `greetPrivate`); role-based access is `auth.requireRoles([...])`.

## Growing into a database

If this project later needs Postgres, look at the full-backend profile scaffolded by the same CLI (`bunx @donilite/create-wrap` → "Full backend"): copy its `src/bootstrap.ts` (adds `initializeDatabase()`), `drizzle.config.ts`, `compose.yml`, and `src/db/index.ts`, then switch a feature's `WrapService`/`RouterController` to `BaseService<Repo>`/`BaseController<Service>`.

## Useful commands

| Command | Description |
| --- | --- |
| `bun run dev` | dev server with hot reload |
| `bun test` | test suite |
| `bun run typecheck` / `bun run lint` | static checks |
