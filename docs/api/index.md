---
title: API reference
nav_order: 4
has_children: true
---

Every exported class, function, interface, and type, grouped by module — full signatures, every parameter, every option.

| Page | Module |
|---|---|
| [Wrap](wrap.md) | `wrap.ts` — the composition root |
| [Controllers](controllers.md) | `base.controller.ts` — `RouterController`, `BaseController` |
| [Services](services.md) | `base.service.ts` — `WrapService`, `BaseService` |
| [Repositories](repositories.md) | `base.repository.ts` — `BaseRepository`, offline sync |
| [Auth](auth.md) | `middleware/auth/*` — `AuthController`, `JwtCookieAuthController` |
| [Decorators](decorators.md) | `decorators/*` — every `@Decorator` |
| [DTO & Entity](dto.md) | `dto.ts`, `entity.ts` — `BaseDTO`, `SchemaDTO`, `SelectDTO`, `InsertDTO`, `Entity()`, `relationsOf()` |
| [Swagger](swagger.md) | `swagger/index.ts` — `SwaggerGenerator`, `setupSwagger` |
| [Registry, database & lifecycle](registry.md) | `registry.ts`, `database.ts`, `transaction.ts`, `events.ts` |
| [Realtime](realtime.md) | `realtime/index.ts` — `@donilite/wrap/realtime` (Bun-only) |
| [Testing](testing.md) | `testing/index.ts` — `@donilite/wrap/testing` |
| [Helpers, storage, cache, middleware](helpers.md) | Everything else in the barrel |
