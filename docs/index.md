---
title: Home
nav_order: 1
---

Bun-first backend framework on [Hono](https://hono.dev) + [Drizzle](https://orm.drizzle.team), decorator-driven, OOP composition. Vertical-slice architecture: a Drizzle table is the single source of truth an entity, its DTOs, its validation, and its OpenAPI schema are all derived from.

Two packages, released together:

- **`@donilite/wrap`** — the framework.
- **`@donilite/create-wrap`** — `bunx @donilite/create-wrap@latest` scaffolds a new project, interactively, across five profiles (full backend, lightweight API, API aggregator, fullstack SSR, proxy/gateway).

## Where to start

- New to the framework? → [Getting started](getting-started.md)
- Understand how the pieces fit together first → [Architecture guide](guide/architecture.md)
- Looking for a specific class/function's exact signature → [API reference](api/index.md) (one page per module)
- Scaffolding a new project / CLI profiles → [`create-wrap` CLI reference](cli/create-wrap.md)

## Guides

| Guide | Covers |
|---|---|
| [Architecture](guide/architecture.md) | `Wrap`, controller/service/repository layers, feature slices, parent → children composition |
| [Auth](guide/auth.md) | `AuthController`, presets, `guard()`, `combine()`, registry-typed identity |
| [Offline-first sync](guide/sync.md) | `findChangedSince`/`applyBatch`, cursors, conflict resolution |
| [Swagger / OpenAPI](guide/swagger.md) | Spec generation, security schemes, tags, path params |

## API reference

Every exported class, function, interface, and type, grouped by module — full signatures, every parameter, every option.

| Page | Module |
|---|---|
| [Wrap](api/wrap.md) | `wrap.ts` — the composition root |
| [Controllers](api/controllers.md) | `base.controller.ts` — `RouterController`, `BaseController` |
| [Services](api/services.md) | `base.service.ts` — `WrapService`, `BaseService` |
| [Repositories](api/repositories.md) | `base.repository.ts` — `BaseRepository`, offline sync |
| [Auth](api/auth.md) | `middleware/auth/*` — `AuthController`, `JwtCookieAuthController` |
| [Decorators](api/decorators.md) | `decorators/*` — every `@Decorator` |
| [DTO & Entity](api/dto.md) | `dto.ts`, `entity.ts` — `BaseDTO`, `SchemaDTO`, `SelectDTO`, `InsertDTO`, `Entity()`, `relationsOf()` |
| [Swagger](api/swagger.md) | `swagger/index.ts` — `SwaggerGenerator`, `setupSwagger` |
| [Registry, database & lifecycle](api/registry.md) | `registry.ts`, `database.ts`, `transaction.ts`, `events.ts` |
| [Realtime](api/realtime.md) | `realtime/index.ts` — `@donilite/wrap/realtime` (Bun-only) |
| [Testing](api/testing.md) | `testing/index.ts` — `@donilite/wrap/testing` |
| [Helpers, storage, cache, middleware](api/helpers.md) | Everything else in the barrel |

## Package exports

```ts
import { /* ... */ } from "@donilite/wrap";           // everything except realtime/testing
import { /* ... */ } from "@donilite/wrap/realtime";  // Bun-only: WebSocket topics + Redis relay
import { /* ... */ } from "@donilite/wrap/testing";   // PGlite-backed test helpers
```
